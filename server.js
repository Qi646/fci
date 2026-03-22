const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const auditLog = [];

const roleAccessTiers = {
  'public': ['open'],
  'eng_staff': ['open', 'internal'],
  'plan_staff': ['open', 'internal'],
  'health_steward': ['open', 'internal', 'restricted']
};

const datasets = {};
const datasetFiles = [
  'eng_pressure_zones.json',
  'plan_permits_2024.json',
  'health_cases.json',
  'transit_gtfs_stops.json'
];

datasetFiles.forEach(file => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8'));
  datasets[data.dataset_id] = data;
});

function logAudit(action, role, details) {
  auditLog.push({
    timestamp: new Date().toISOString(),
    action,
    role: role || 'none',
    ...details
  });
}

function accessMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const role = authHeader.replace('Bearer ', '') || 'public';
  
  req.userRole = role;
  req.allowedTiers = roleAccessTiers[role] || ['open'];
  
  logAudit('request', role, {
    method: req.method,
    path: req.path,
    query: req.query
  });
  
  next();
}

function tierCheckMiddleware(req, res, next) {
  const requestedTier = req.dataset?.access_tier;
  
  if (!requestedTier || req.allowedTiers.includes(requestedTier)) {
    next();
  } else {
    logAudit('blocked', req.userRole, {
      path: req.path,
      reason: `Tier '${requestedTier}' requires elevated access`
    });
    res.status(403).json({
      error: 'Access denied',
      message: `This dataset requires '${requestedTier}' access tier`,
      your_role: req.userRole,
      allowed_tiers: req.allowedTiers
    });
  }
}

app.get('/catalog', accessMiddleware, (req, res) => {
  const { q, dept, tier } = req.query;
  
  let results = Object.values(datasets).map(ds => ({
    dataset_id: ds.dataset_id,
    name: ds.name,
    owner_dept: ds.owner_dept,
    access_tier: ds.access_tier,
    spatial_key: ds.spatial_key,
    last_updated: ds.last_updated,
    quality_score: ds.quality_score,
    fields: ds.fields
  }));
  
  if (q) {
    const search = q.toLowerCase();
    results = results.filter(ds => 
      ds.name.toLowerCase().includes(search) ||
      ds.dataset_id.toLowerCase().includes(search) ||
      (datasets[ds.dataset_id].description || '').toLowerCase().includes(search) ||
      ds.fields.some(f => f.toLowerCase().includes(search))
    );
  }
  
  if (dept) {
    results = results.filter(ds => ds.owner_dept.toLowerCase() === dept.toLowerCase());
  }
  
  if (tier) {
    results = results.filter(ds => req.allowedTiers.includes(ds.access_tier));
  }
  
  const resultsWithJoinInfo = results.map(ds => {
    const otherDatasets = Object.values(datasets).filter(d => 
      d.dataset_id !== ds.dataset_id && 
      d.spatial_key === ds.spatial_key
    );
    return {
      ...ds,
      joinable_with: otherDatasets.map(d => ({
        dataset_id: d.dataset_id,
        name: d.name,
        shared_key: ds.spatial_key
      }))
    };
  });
  
  res.json({
    count: resultsWithJoinInfo.length,
    datasets: resultsWithJoinInfo
  });
});

app.get('/datasets/:id', accessMiddleware, (req, res) => {
  const ds = datasets[req.params.id];
  if (!ds) {
    return res.status(404).json({ error: 'Dataset not found' });
  }
  
  req.dataset = ds;
  tierCheckMiddleware(req, res, () => {
    res.json({
      dataset_id: ds.dataset_id,
      name: ds.name,
      owner_dept: ds.owner_dept,
      access_tier: ds.access_tier,
      spatial_key: ds.spatial_key,
      fields: ds.fields,
      record_count: ds.records.length
    });
  });
});

app.get('/datasets/:id/query', accessMiddleware, (req, res) => {
  const ds = datasets[req.params.id];
  if (!ds) {
    return res.status(404).json({ error: 'Dataset not found' });
  }
  
  req.dataset = ds;
  tierCheckMiddleware(req, res, () => {
    let results = [...ds.records];
    
    const { parcel_id, bbox, since, fields, aggregate } = req.query;
    
    if (parcel_id) {
      results = results.filter(r => r.parcel_id === parcel_id || r.civic_address === parcel_id);
    }
    
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
      if (ds.dataset_id === 'transit-stops') {
        results = results.filter(r => 
          r.lng >= minLng && r.lng <= maxLng &&
          r.lat >= minLat && r.lat <= maxLat
        );
      }
    }
    
    if (since) {
      const sinceDate = new Date(since);
      results = results.filter(r => {
        const dateField = r.application_date || r.week_ending || r.last_updated;
        return dateField && new Date(dateField) >= sinceDate;
      });
    }
    
    if (fields) {
      const fieldList = fields.split(',');
      results = results.map(r => {
        const filtered = {};
        fieldList.forEach(f => {
          if (r[f] !== undefined) filtered[f] = r[f];
        });
        return filtered;
      });
    }
    
    if (aggregate) {
      const piiFields = ds.pii_fields || [];
      const safeFields = ds.fields.filter(f => !piiFields.includes(f));
      
      if (aggregate === 'count') {
        results = { _count: results.length };
      } else if (aggregate === 'sum' && safeFields.includes(req.query.field || 'units')) {
        const field = req.query.field || safeFields.find(f => f !== 'civic_address' && f !== 'parcel_id');
        results = { _sum: { [field]: results.reduce((sum, r) => sum + (Number(r[field]) || 0), 0) } };
      } else if (aggregate === 'avg') {
        const field = req.query.field || 'capacity_pct';
        const values = results.map(r => Number(r[field]) || 0).filter(v => !isNaN(v));
        results = { _avg: { [field]: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 } };
      }
    }
    
    logAudit('query', req.userRole, {
      dataset: req.params.id,
      filters_applied: { parcel_id, bbox, since, fields, aggregate },
      result_count: typeof results === 'object' && !Array.isArray(results) ? 1 : results.length
    });
    
    res.json({
      dataset_id: ds.dataset_id,
      query: req.query,
      result_count: typeof results === 'object' && !Array.isArray(results) ? 1 : results.length,
      results
    });
  });
});

app.post('/join', accessMiddleware, (req, res) => {
  const { left_dataset, right_dataset, join_key, left_fields, right_fields } = req.body;
  
  if (!left_dataset || !right_dataset || !join_key) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['left_dataset', 'right_dataset', 'join_key']
    });
  }
  
  const leftDs = datasets[left_dataset];
  const rightDs = datasets[right_dataset];
  
  if (!leftDs) {
    return res.status(404).json({ error: `Dataset '${left_dataset}' not found` });
  }
  if (!rightDs) {
    return res.status(404).json({ error: `Dataset '${right_dataset}' not found` });
  }
  
  const leftTierOk = req.allowedTiers.includes(leftDs.access_tier);
  const rightTierOk = req.allowedTiers.includes(rightDs.access_tier);
  
  if (!leftTierOk || !rightTierOk) {
    logAudit('join_blocked', req.userRole, {
      left_dataset,
      right_dataset,
      reason: !leftTierOk ? `Insufficient access for '${left_dataset}' (${leftDs.access_tier})` : `Insufficient access for '${right_dataset}' (${rightDs.access_tier})`
    });
    return res.status(403).json({
      error: 'Access denied',
      message: 'One or both datasets require elevated access privileges',
      left_dataset_tier: leftDs.access_tier,
      right_dataset_tier: rightDs.access_tier,
      your_role: req.userRole
    });
  }
  
  const leftFieldSet = left_fields || leftDs.fields;
  const rightFieldSet = (right_fields || rightDs.fields).filter(f => f !== join_key);
  
  const joined = [];
  const leftIndex = new Map();
  leftDs.records.forEach(r => {
    const key = r[join_key];
    if (key) {
      if (!leftIndex.has(key)) leftIndex.set(key, []);
      leftIndex.get(key).push(r);
    }
  });
  
  rightDs.records.forEach(r => {
    const key = r[join_key];
    const leftRecords = leftIndex.get(key) || [];
    
    if (leftRecords.length === 0 && !left_fields) {
      return;
    }
    
    if (leftRecords.length > 0) {
      leftRecords.forEach(left => {
        const record = { [join_key]: key };
        leftFieldSet.forEach(f => {
          if (left[f] !== undefined) record[`left_${f}`] = left[f];
        });
        rightFieldSet.forEach(f => {
          if (r[f] !== undefined) record[`right_${f}`] = r[f];
        });
        joined.push(record);
      });
    } else if (left_fields) {
      const record = { [join_key]: key };
      rightFieldSet.forEach(f => {
        if (r[f] !== undefined) record[`right_${f}`] = r[f];
      });
      joined.push(record);
    }
  });
  
  logAudit('join_success', req.userRole, {
    left_dataset,
    right_dataset,
    join_key,
    result_count: joined.length
  });
  
  res.json({
    left_dataset,
    right_dataset,
    join_key,
    left_fields: leftFieldSet,
    right_fields: rightFieldSet,
    result_count: joined.length,
    results: joined.slice(0, 100)
  });
});

app.get('/audit', accessMiddleware, (req, res) => {
  const { limit = 50, action } = req.query;
  
  let logs = [...auditLog];
  
  if (action) {
    logs = logs.filter(l => l.action === action);
  }
  
  res.json({
    count: logs.length,
    logs: logs.slice(-Math.min(parseInt(limit), 100))
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Municipal Data Infrastructure API',
    version: '1.0.0',
    endpoints: [
      'GET /catalog - List all datasets with optional filters',
      'GET /datasets/:id - Get dataset metadata',
      'GET /datasets/:id/query - Query dataset records',
      'POST /join - Join two datasets on a shared key',
      'GET /audit - View audit log'
    ],
    roles: Object.keys(roleAccessTiers),
    datasets: Object.keys(datasets)
  });
});

app.listen(PORT, () => {
  console.log(`Municipal Data API running on http://localhost:${PORT}`);
  console.log(`Available datasets: ${Object.keys(datasets).join(', ')}`);
});
