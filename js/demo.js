'use strict';

/* Compliance Plus — sample data so the portal can be tried out.
   Everything it creates is marked demo: true and can be removed in Settings. */

function loadDemoData() {
  const uid = Store.uid;
  const client = Store.upsert('clients', { demo: true, name: 'Demo — Riverside Business Centre Ltd', contact: 'Sam Patel', phone: '01785 000000', email: 'facilities@example.com', address: '1 Riverside Way, Stafford', notes: 'Sample client created to show how the portal works.' });
  const room = (name, x, y, w, d) => ({ id: uid(), name, x, y, w, d });
  const g = { id: uid(), name: 'Ground Floor', level: 0, height: 2.7, rooms: [
    room('Reception', 0, 0, 8, 6), room('Café', 8, 0, 10, 6), room('Corridor', 0, 6, 18, 2),
    room('Office G1', 0, 8, 6, 6), room('Office G2', 6, 8, 6, 6), room('Plant Room', 12, 8, 3, 6), room('Stairs', 15, 8, 3, 6)
  ] };
  const f1 = { id: uid(), name: 'First Floor', level: 1, height: 2.6, rooms: [
    room('Office 1A', 0, 0, 9, 6), room('Office 1B', 9, 0, 6, 6), room('Kitchen', 15, 0, 3, 6), room('Corridor', 0, 6, 18, 2),
    room('Meeting Room', 0, 8, 8, 6), room('Store', 8, 8, 4, 6), room('WC', 12, 8, 3, 6), room('Stairs', 15, 8, 3, 6)
  ] };
  const site = Store.upsert('sites', { demo: true, clientId: client.id, name: 'Riverside Business Centre', address: '1 Riverside Way, Stafford', postcode: 'ST16 2AB', buildingUse: 'Offices With Ground Floor Café', responsiblePerson: 'Sam Patel (Facilities Manager)', floors: [g, f1] });
  const roomAt = (floor, x, y) => (floor.rooms.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d) || {}).id || null;

  const date = addDays(today(), -6);
  const inspector = Store.settings.assessorName || 'Demo Inspector';
  const add = (floor, type, x, y, name, details, result) => {
    const it = Store.upsert('items', { demo: true, ref: Store.nextRef(), siteId: site.id, floorId: floor.id, roomId: roomAt(floor, x, y), x, y, type, name, details, labelPrinted: date });
    if (!result) return it;
    const t = ITEM_TYPES[type];
    const answers = {};
    for (const c of t.checks) answers[c.key] = { v: 'pass' };
    if (type === 'fire-door' && details.glazed !== 'Yes') answers.glazing = { v: 'na' };
    if (type === 'fire-door') answers.vents = { v: 'na' };
    if (type === 'extinguisher' && details.medium === 'CO2') answers.gauge = { v: 'na' };
    for (const [k, note] of Object.entries(result.fails || {})) answers[k] = { v: 'fail', note };
    Store.upsert('inspections', {
      demo: true, itemId: it.id, siteId: site.id, type, date, inspector, answers,
      readings: result.readings || {}, photos: [], notes: result.notes || '', action: result.action || '',
      outcome: result.outcome || (result.fails ? 'fail' : 'pass'), intervalMonths: t.interval, nextDue: addMonths(date, result.interval || t.interval)
    });
    return it;
  };
  const gaps = (h, hi, l, t) => ({ gapHead: h, gapHinge: hi, gapLock: l, gapThreshold: t });
  const fd = (rating, use) => ({ rating, config: 'Single Leaf', use, certification: 'Label', glazed: 'No' });

  // Ground floor
  add(g, 'fire-door', 4, 6, 'Reception To Corridor', fd('FD30S', 'Communal / Corridor'), { readings: gaps(3, 3, 3.5, 3) });
  add(g, 'fire-door', 12, 6, 'Café To Corridor', fd('FD30S', 'Communal / Corridor'), { readings: gaps(3, 4, 6, 9), fails: { gaps: 'Closing-side gap 6 mm', closer: 'Closer does not engage latch from 5°', threshold: 'Threshold gap 9 mm on smoke-sealed door' }, action: 'Adjust or rehang door to bring gaps within 2–4 mm; adjust closer; fit drop-down seal or replace door set if not achievable.' });
  add(g, 'fire-door', 3, 8, 'Office G1', fd('FD30', 'Office / Room'), { readings: gaps(3, 2.5, 3, 5) });
  add(g, 'fire-door', 9, 8, 'Office G2', fd('FD30', 'Office / Room'), { readings: gaps(3, 3, 4, 6) });
  add(g, 'fire-door', 13.5, 8, 'Plant Room', fd('FD60', 'Plant / Riser'), { readings: gaps(2.5, 3, 3, 4), fails: {}, outcome: 'advisory', notes: '"Fire Door Keep Locked" sign faded.', action: 'Replace faded signage.' });
  add(g, 'fire-door', 16.5, 8, 'Ground Floor Stair Door', fd('FD30S', 'Stair Core'), { readings: gaps(3, 3, 3, 2) });
  add(g, 'extinguisher', 0.6, 5.4, 'Reception', { medium: 'CO2', size: '2 kg' }, {});
  add(g, 'extinguisher', 17.4, 0.6, 'Café Kitchen Area', { medium: 'Wet Chemical', size: '6 L' }, {});
  add(g, 'emergency-light', 6, 7, 'Corridor West', { fitting: 'Bulkhead', mode: 'Non-Maintained', duration: '3 Hours' }, {});
  add(g, 'emergency-light', 14, 7, 'Corridor East', { fitting: 'Exit Sign', mode: 'Maintained', duration: '3 Hours' }, {});
  add(g, 'alarm', 0.4, 7, 'Main Entrance Call Point', { device: 'Manual Call Point', zone: '1' }, {});
  add(g, 'pat', 10, 1, 'Coffee Machine', { appliance: 'Coffee Machine', make: 'Sage', class: 'Class I', category: 'Movable', fuse: '13', environment: 'Kitchen' }, { readings: { earth: 0.06, insulation: 200, leakage: 0.4 } });
  add(g, 'pat', 2, 2, 'Reception PC', { appliance: 'Desktop PC', make: 'Dell', class: 'Class I', category: 'IT Equipment', fuse: '5', environment: 'Office' }, { readings: { earth: 0.05, insulation: 150, leakage: 0.9 } });
  add(g, 'hazard', 9.5, 4.5, 'Café Floor', { category: 'Slips, Trips & Falls', description: 'Smooth tiles near coffee counter' }, { outcome: 'advisory', notes: 'Floor wet during service.', action: 'Provide "Wet Floor" signs and a mat at the counter.' });

  // First floor
  add(f1, 'fire-door', 4, 6, 'Office 1A', fd('FD30', 'Office / Room'), { readings: gaps(3, 3, 3, 4) });
  add(f1, 'fire-door', 12, 6, 'Office 1B', fd('FD30', 'Office / Room'), { readings: gaps(2, 3, 4, 5) });
  add(f1, 'fire-door', 16.5, 6, 'Kitchen', fd('FD30S', 'Kitchen'), { readings: gaps(3, 3, 3, 3) });
  add(f1, 'fire-door', 4, 8, 'Meeting Room', Object.assign(fd('FD30', 'Office / Room'), { glazed: 'Yes' }), { readings: gaps(3, 3, 3, 5) });
  add(f1, 'fire-door', 10, 8, 'Store', fd('FD30', 'Office / Room'), { readings: gaps(3, 3, 3, 5), fails: { holdopen: 'Door wedged open with a fire extinguisher', signage: 'No "Fire Door Keep Shut" sign' }, action: 'Remove wedge and brief staff; fit signage. Consider an alarm-linked hold-open device if the door needs to stay open.' });
  add(f1, 'fire-door', 16.5, 8, 'First Floor Stair Door', fd('FD30S', 'Stair Core'), { readings: gaps(3, 3, 3, 3) });
  add(f1, 'extinguisher', 1, 7, 'Corridor', { medium: 'Water', size: '6 L' }, {});
  add(f1, 'emergency-light', 9, 7, 'Corridor', { fitting: 'Bulkhead', mode: 'Non-Maintained', duration: '3 Hours' }, { fails: { lamp: 'Lamp failed to illuminate on test' }, action: 'Replace lamp / battery pack and re-test.' });
  add(f1, 'alarm', 4, 3, 'Office 1A Detector', { device: 'Smoke Detector', zone: '2' }, {});
  add(f1, 'pat', 2, 2, 'Laptop Charger', { appliance: 'Laptop Charger', make: 'Lenovo', class: 'Class II', category: 'IT Equipment', fuse: '3', environment: 'Office' }, { readings: { insulation: 300, leakage: 0.05 } });
  add(f1, 'pat', 17, 1, 'Microwave', { appliance: 'Microwave', make: 'Panasonic', class: 'Class I', category: 'Movable', fuse: '13', environment: 'Kitchen' }, { readings: { earth: 0.08, insulation: 100, leakage: 0.6 } });
  add(f1, 'pat', 5, 11, 'Extension Lead', { appliance: '4-Way Extension Lead', class: 'Class I', category: 'Extension Lead / Cable', fuse: '13', environment: 'Office' }, { readings: { earth: 0.09, insulation: 0.6, polarity: 'pass' }, fails: { cable: 'Outer sheath split near plug' }, action: 'Withdrawn from use and labelled "Do Not Use". Replace.' });
  add(f1, 'pat', 17, 4.5, 'Kettle', { appliance: 'Kettle', class: 'Class I', category: 'Portable', fuse: '13', environment: 'Kitchen' });

  // Fire risk assessment (draft)
  const answers = {};
  for (const s of FRA_SECTIONS) { answers[s.key] = {}; for (const [k] of s.questions) answers[s.key][k] = { v: 'yes' }; }
  answers.doors.doors = { v: 'no', note: 'Two fire doors defective — see fire door schedule.' };
  answers.lighting.monthly = { v: 'no', note: 'No record of monthly tests since June.' };
  answers.management.drills = { v: 'no', note: 'Last drill over 12 months ago.' };
  answers.heating.lightning = { v: 'na' };
  Store.upsert('assessments', {
    demo: true, siteId: site.id, kind: 'fra', title: site.name, date, assessor: inspector, status: 'Draft', reviewDate: addMonths(date, 12),
    info: { use: 'Offices with ground floor café', floors: '2', area: '430', construction: 'Brick and block, concrete floors, pitched roof', occupants: '60', sleeping: 'No', atRisk: 'Visitors unfamiliar with the building', responsible: 'Sam Patel', evacuation: 'Simultaneous' },
    answers, likelihood: 'Medium', consequence: 'Moderate Harm',
    actions: [
      { id: uid(), source: 'doors.doors', text: 'Repair defective fire doors (Café and Store) and stop doors being wedged open.', priority: 'High', who: 'Sam Patel', due: addMonths(date, 1), done: false },
      { id: uid(), source: 'lighting.monthly', text: 'Restart monthly emergency lighting tests and record them in the log book.', priority: 'Medium', who: 'Sam Patel', due: addMonths(date, 1), done: false },
      { id: uid(), source: 'management.drills', text: 'Hold a fire drill and record the evacuation time.', priority: 'Medium', who: 'Sam Patel', due: addMonths(date, 2), done: false }
    ],
    summary: 'The premises are generally well managed. Fire door defects and gaps in testing records need attention.'
  });

  // H&S risk assessment (draft)
  const pick = (name, l, s, action) => Object.assign({ id: uid(), l: String(l), s: String(s), action: action || '', by: action ? 'Sam Patel' : '', due: action ? addMonths(date, 1) : '', done: false }, HS_PRESETS.find(p => p.hazard === name));
  Store.upsert('assessments', {
    demo: true, siteId: site.id, kind: 'hs', title: site.name, date, assessor: inspector, status: 'Draft', reviewDate: addMonths(date, 12),
    info: { activity: 'General office and café operations', people: 'Staff (25), café staff (4), visitors, contractors', responsible: 'Sam Patel' },
    hazards: [
      pick('Slips, trips and falls', 3, 3, 'Wet floor signs and entrance matting at café counter.'),
      pick('Electrical equipment', 2, 4, 'Replace failed extension lead.'),
      pick('Manual handling', 2, 3),
      pick('Display screen equipment', 3, 2, 'Complete outstanding DSE assessments for first floor staff.')
    ],
    summary: 'Risks are generally well controlled.'
  });
  invalidateState();
  Store.flush();
  return site;
}

function removeDemoData() {
  for (const c of Store.list('clients').filter(c => c.demo)) deleteClientCascade(c.id);
  invalidateState();
  Store.flush();
}
