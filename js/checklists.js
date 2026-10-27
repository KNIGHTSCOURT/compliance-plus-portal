'use strict';

/* Compliance Plus — inspection checklists and risk assessment templates.
   Edit the wording here to change what appears on site and in reports. */

const ITEM_TYPES = {
  'fire-door': {
    label: 'Fire Door', code: 'FD', color: '#c0392b', interval: 6,
    details: [
      { key: 'rating', label: 'Fire Rating', type: 'select', options: ['FD30', 'FD30S', 'FD60', 'FD60S', 'FD90', 'FD120', 'Unknown'] },
      { key: 'config', label: 'Configuration', type: 'select', options: ['Single Leaf', 'Double Leaf', 'Leaf And A Half', 'Riser / Cupboard'] },
      { key: 'use', label: 'Door Use', type: 'select', options: ['Flat Entrance', 'Communal / Corridor', 'Stair Core', 'Plant / Riser', 'Kitchen', 'Office / Room', 'Final Exit', 'Other'] },
      { key: 'certification', label: 'Certification Evidence', type: 'select', options: ['Label', 'Plug', 'Certificate', 'None Found'] },
      { key: 'glazed', label: 'Glazed', type: 'select', options: ['No', 'Yes'] },
      { key: 'manufacturer', label: 'Manufacturer / Cert No.', type: 'text' }
    ],
    checks: [
      { key: 'cert', q: 'Certification label, plug or certificate present', help: 'Third-party certification evidence for the door set' },
      { key: 'leaf', q: 'Door leaf in good condition', help: 'No holes, splits, delamination or unauthorised alterations' },
      { key: 'frame', q: 'Frame secure and undamaged', help: 'Frame fixed firmly, gaps to wall sealed with fire-rated material' },
      { key: 'gaps', q: 'Leaf-to-frame gaps 2–4 mm', help: 'Measure head, hinge side and closing side' },
      { key: 'threshold', q: 'Threshold gap within limits', help: 'Normally no more than 3 mm where smoke seals are needed, otherwise per certification (typically ≤ 8–10 mm)' },
      { key: 'seals', q: 'Intumescent strips and smoke seals intact', help: 'Present, continuous, correct size, not painted over' },
      { key: 'hinges', q: 'Hinges sound — minimum 3, CE/UKCA marked', help: 'All screws present, no wear or oil leaks' },
      { key: 'closer', q: 'Self-closer shuts the door fully onto the latch', help: 'Test from 5° and from fully open' },
      { key: 'latch', q: 'Latch / lock operates correctly', help: 'Engages without slamming; escape doors open without a key' },
      { key: 'ironmongery', q: 'Ironmongery fire-rated and protected', help: 'Intumescent pads behind locks / hinges where required' },
      { key: 'glazing', q: 'Glazing fire-rated with secure beads and seals', help: 'Mark N/A if not glazed' },
      { key: 'signage', q: 'Correct signage fitted', help: '"Fire Door Keep Shut" / "Keep Locked" on the correct face' },
      { key: 'holdopen', q: 'Not wedged or held open', help: 'Any hold-open devices release on fire alarm' },
      { key: 'vents', q: 'Letterplate / air grille fire-rated', help: 'Mark N/A if none fitted' }
    ],
    readings: [
      { key: 'gapHead', label: 'Gap At Head', unit: 'mm', min: 2, max: 4 },
      { key: 'gapHinge', label: 'Gap Hinge Side', unit: 'mm', min: 2, max: 4 },
      { key: 'gapLock', label: 'Gap Closing Side', unit: 'mm', min: 2, max: 4 },
      { key: 'gapThreshold', label: 'Threshold Gap', unit: 'mm', max: 10 }
    ]
  },

  'door': {
    label: 'Door (Non-Fire)', code: 'DR', color: '#7f8c8d', interval: 12,
    details: [
      { key: 'config', label: 'Configuration', type: 'select', options: ['Single Leaf', 'Double Leaf', 'Leaf And A Half', 'Sliding', 'Roller Shutter'] },
      { key: 'use', label: 'Door Use', type: 'select', options: ['Office / Room', 'WC / Washroom', 'Store', 'Corridor', 'Plant / Service', 'Other'] },
      { key: 'fireDoorCheck', label: 'Should This Be A Fire Door?', type: 'select', options: ['No', 'Yes — Needs Upgrading', 'To Be Confirmed'] }
    ],
    checks: [
      { key: 'operates', q: 'Opens and closes freely', help: 'No sticking, dropping or binding' },
      { key: 'ironmongery', q: 'Handles, locks and hinges secure', help: '' },
      { key: 'condition', q: 'Leaf, frame and any glazing undamaged', help: '' },
      { key: 'notRoute', q: 'Not needed as a fire door on an escape route', help: 'Fail if this door protects a stair, escape corridor or high-risk room' },
      { key: 'signage', q: 'Signage correct', help: 'No "Fire Door" signs on doors that are not fire doors' }
    ],
    readings: []
  },

  'fire-exit': {
    label: 'Fire Exit', code: 'EX', color: '#117a65', interval: 12,
    details: [
      { key: 'exitType', label: 'Exit Type', type: 'select', options: ['Final Exit Door', 'Escape Route Door', 'Storey Exit', 'Emergency Exit (Not Normally Used)', 'Gate / Outside Route'] },
      { key: 'hardware', label: 'Opening Device', type: 'select', options: ['Push Bar (Panic Bar)', 'Push Pad', 'Lever Handle', 'Thumb Turn', 'Push Plate', 'Electromagnetic Lock + Release', 'None'] },
      { key: 'opensOutward', label: 'Opens In Direction Of Escape', type: 'select', options: ['Yes', 'No', 'Not Required'] },
      { key: 'leadsTo', label: 'Leads To', type: 'text', placeholder: 'e.g. Car park / assembly point at front of building' }
    ],
    checks: [
      { key: 'clearInside', q: 'Route to the exit is clear', help: 'No storage, furniture or obstructions on the escape route inside' },
      { key: 'clearOutside', q: 'Outside of the exit is clear', help: 'Not blocked by bins, vehicles, deliveries, vegetation or ice' },
      { key: 'opens', q: 'Opens easily and immediately without a key', help: 'No specialist knowledge needed; one action where possible' },
      { key: 'hardwareOk', q: 'Panic / emergency hardware works correctly', help: 'Push bar or pad releases fully (BS EN 1125 / BS EN 179)' },
      { key: 'noLocks', q: 'No padlocks, chains, bolts or extra locks', help: 'Any security devices release automatically when occupied' },
      { key: 'maglock', q: 'Electric locks release on fire alarm / power loss', help: 'Green break-glass override present and working — N/A if none' },
      { key: 'direction', q: 'Opens in the direction of escape where required', help: 'Normally needed for more than 60 people or high-risk areas' },
      { key: 'sign', q: 'Fire exit sign present, correct and visible', help: 'Running-man pictogram; "Push Bar To Open" where fitted' },
      { key: 'lighting', q: 'Emergency lighting covers the exit', help: 'Inside the door and outside at the final exit' },
      { key: 'condition', q: 'Door, frame and threshold in good condition', help: 'No trip hazards, damaged steps or sticking door' },
      { key: 'closes', q: 'Closes and latches securely', help: 'Self-closer works where fitted; not left propped open' },
      { key: 'safePlace', q: 'Leads to a place of safety', help: 'Route away from the building to the assembly point is clear' }
    ],
    readings: [
      { key: 'releaseForce', label: 'Release Force At Push Bar / Pad (Optional)', unit: 'N', max: 80, note: 'BS EN 1125 limit for panic bars' },
      { key: 'clearWidth', label: 'Clear Width (Optional)', unit: 'mm', min: 750, note: 'Typical minimum for up to 60 people' }
    ]
  },

  'pat': {
    label: 'PAT Appliance', code: 'PAT', color: '#2471a3', interval: 12,
    details: [
      { key: 'appliance', label: 'Appliance', type: 'text', placeholder: 'e.g. Kettle, Laptop Charger, Extension Lead' },
      { key: 'make', label: 'Make', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'serial', label: 'Serial No.', type: 'text' },
      { key: 'class', label: 'Electrical Class', type: 'select', options: ['Class I', 'Class II', 'Class III / Other'] },
      { key: 'category', label: 'Equipment Category', type: 'select', options: ['Portable', 'Hand-Held', 'Movable', 'Stationary', 'IT Equipment', 'Extension Lead / Cable', 'Fixed (Plug Connected)'] },
      { key: 'fuse', label: 'Fuse Fitted (A)', type: 'select', options: ['3', '5', '13', 'N/A'] },
      { key: 'environment', label: 'Environment', type: 'select', options: ['Office', 'Kitchen', 'Workshop / Industrial', 'Construction Site', 'Public Area', 'Residential'] }
    ],
    checks: [
      { key: 'plug', q: 'Plug in good condition', help: 'No cracks, burning or bent pins; BS 1363 compliant' },
      { key: 'fuseok', q: 'Correct fuse fitted', help: 'Rating suits the appliance and cable' },
      { key: 'terminations', q: 'Plug wiring and cord grip correct', help: 'Internal check where plug can be opened' },
      { key: 'cable', q: 'Flex / cable undamaged', help: 'No cuts, joins, taped repairs or exposed inner cores' },
      { key: 'casing', q: 'Appliance casing undamaged', help: 'No cracks, missing covers or loose parts' },
      { key: 'heat', q: 'No signs of overheating', help: 'No scorch marks or discolouration' },
      { key: 'suitable', q: 'Suitable for the environment and use', help: 'e.g. not a domestic item in a wet/industrial area' },
      { key: 'functional', q: 'Functional check satisfactory', help: 'Switches and operates normally' }
    ],
    readings: [
      { key: 'earth', label: 'Earth Continuity', unit: 'Ω', max: 0.1, classes: ['Class I'], note: 'Limit 0.1 Ω plus the resistance of the flex' },
      { key: 'insulation', label: 'Insulation Resistance', unit: 'MΩ', minByClass: { 'Class I': 1, 'Class II': 2 } },
      { key: 'leakage', label: 'Leakage / Touch Current', unit: 'mA', maxByClass: { 'Class I': 3.5, 'Class II': 0.25 } },
      { key: 'polarity', label: 'Polarity (Leads)', unit: '', type: 'passfail' }
    ]
  },

  'extinguisher': {
    label: 'Fire Extinguisher', code: 'EXT', color: '#e74c3c', interval: 12,
    details: [
      { key: 'medium', label: 'Type', type: 'select', options: ['Water', 'Foam', 'CO2', 'Dry Powder', 'Wet Chemical', 'Water Mist', 'Fire Blanket'] },
      { key: 'size', label: 'Size', type: 'text', placeholder: 'e.g. 6 L, 2 kg' },
      { key: 'manufactureYear', label: 'Year Of Manufacture', type: 'text' }
    ],
    checks: [
      { key: 'place', q: 'In its designated position and visible', help: 'Not obstructed; signage above' },
      { key: 'type', q: 'Right type for the fire risk nearby', help: 'Class A solids (water/foam), B liquids (foam/CO2/powder), C gases, D metals, F cooking oil (wet chemical), electrical (CO2)' },
      { key: 'mounted', q: 'Wall-mounted or on a stand', help: 'Handle approx. 1 m from floor (0.5 m for heavy units)' },
      { key: 'seal', q: 'Safety pin and tamper seal intact', help: '' },
      { key: 'gauge', q: 'Pressure gauge in the green', help: 'N/A for CO2' },
      { key: 'body', q: 'Body, hose and horn undamaged', help: 'No corrosion, dents or perished hose' },
      { key: 'service', q: 'Service label in date', help: 'Annual service by a competent person' },
      { key: 'instructions', q: 'Operating instructions legible', help: '' }
    ],
    readings: []
  },

  'emergency-light': {
    label: 'Emergency Light', code: 'EL', color: '#d4ac0d', interval: 12,
    details: [
      { key: 'fitting', label: 'Fitting Type', type: 'select', options: ['Bulkhead', 'Exit Sign', 'Downlight', 'Twin Spot', 'Recessed', 'Other'] },
      { key: 'mode', label: 'Mode', type: 'select', options: ['Non-Maintained', 'Maintained', 'Sustained'] },
      { key: 'duration', label: 'Rated Duration', type: 'select', options: ['3 Hours', '1 Hour'] }
    ],
    checks: [
      { key: 'lamp', q: 'Lamp illuminates on test', help: 'Simulated mains failure using test key' },
      { key: 'durationok', q: 'Full rated duration achieved', help: 'Annual test only — N/A on monthly checks' },
      { key: 'charge', q: 'Charging indicator lit after test', help: '' },
      { key: 'diffuser', q: 'Diffuser clean and undamaged', help: '' },
      { key: 'pictogram', q: 'Correct pictogram (exit signs)', help: 'Running-man symbol pointing the right way' }
    ],
    readings: []
  },

  'alarm': {
    label: 'Fire Alarm Device', code: 'FA', color: '#a93226', interval: 12,
    details: [
      { key: 'device', label: 'Device', type: 'select', options: ['Manual Call Point', 'Smoke Detector', 'Heat Detector', 'Multi-Sensor', 'Sounder / Beacon', 'Control Panel', 'Other'] },
      { key: 'zone', label: 'Zone', type: 'text' },
      { key: 'address', label: 'Device Address', type: 'text' }
    ],
    checks: [
      { key: 'operated', q: 'Device operated / tested correctly', help: 'Signal received at panel' },
      { key: 'clear', q: 'Unobstructed', help: 'Detectors: 500 mm clear; call points visible and accessible' },
      { key: 'condition', q: 'Undamaged and securely fixed', help: '' },
      { key: 'labelled', q: 'Correctly labelled / zone chart accurate', help: '' }
    ],
    readings: []
  },

  'signage': {
    label: 'Fire Safety Sign', code: 'SGN', color: '#27ae60', interval: 12,
    details: [
      { key: 'sign', label: 'Sign', type: 'select', options: ['Fire Exit', 'Fire Action Notice', 'Fire Door Keep Shut', 'Fire Door Keep Locked', 'Extinguisher ID', 'Assembly Point', 'No Smoking', 'Other'] }
    ],
    checks: [
      { key: 'present', q: 'Sign present and correct', help: '' },
      { key: 'visible', q: 'Clearly visible and legible', help: '' },
      { key: 'photolum', q: 'Photoluminescent / lit where required', help: '' }
    ],
    readings: []
  },

  'hazard': {
    label: 'H&S Hazard Point', code: 'HZ', color: '#8e44ad', interval: 12,
    details: [
      { key: 'category', label: 'Hazard Category', type: 'select', options: ['Slips, Trips & Falls', 'Working At Height', 'Electrical', 'Hazardous Substances (COSHH)', 'Manual Handling', 'Machinery / Equipment', 'Asbestos', 'Legionella / Water', 'Gas', 'Vehicles', 'Security', 'Other'] },
      { key: 'description', label: 'Description', type: 'text' }
    ],
    checks: [
      { key: 'controlled', q: 'Hazard adequately controlled', help: '' },
      { key: 'signs', q: 'Warning signs / barriers in place where needed', help: '' },
      { key: 'records', q: 'Records / checks up to date', help: '' }
    ],
    readings: []
  },

  'other': {
    label: 'Other Equipment', code: 'OTH', color: '#566573', interval: 12,
    details: [
      { key: 'description', label: 'Description', type: 'text' }
    ],
    checks: [
      { key: 'condition', q: 'In good condition', help: '' },
      { key: 'operational', q: 'Operates correctly', help: '' },
      { key: 'records', q: 'Records / service label in date', help: '' }
    ],
    readings: []
  }
};

/* Checks a reading against its limits. Returns 'pass', 'fail' or '' (no value). */
function evaluateReading(reading, value, details) {
  if (value === '' || value === undefined || value === null) return '';
  if (reading.type === 'passfail') return value;
  const v = Number(value);
  if (Number.isNaN(v)) return '';
  const cls = details && details.class;
  if (reading.classes && cls && !reading.classes.includes(cls)) return '';
  let min = reading.min, max = reading.max;
  if (reading.minByClass) min = reading.minByClass[cls];
  if (reading.maxByClass) max = reading.maxByClass[cls];
  if (min !== undefined && v < min) return 'fail';
  if (max !== undefined && v > max) return 'fail';
  return 'pass';
}

function readingLimitText(reading, details) {
  if (reading.type === 'passfail') return 'Pass / Fail';
  const cls = details && details.class;
  const min = reading.minByClass ? reading.minByClass[cls] : reading.min;
  const max = reading.maxByClass ? reading.maxByClass[cls] : reading.max;
  if (reading.classes && cls && !reading.classes.includes(cls)) return `Not required for ${cls}`;
  const parts = [];
  if (min !== undefined) parts.push(`≥ ${min} ${reading.unit}`);
  if (max !== undefined) parts.push(`≤ ${max} ${reading.unit}`);
  return parts.join(' and ') + (reading.note ? ` · ${reading.note}` : '');
}

/* ---------- Fire Risk Assessment (PAS 79-1 style layout) ---------- */
const FRA_INFO = [
  { key: 'use', label: 'Use Of Premises' },
  { key: 'floors', label: 'Number Of Floors' },
  { key: 'area', label: 'Approx. Floor Area (m²)' },
  { key: 'construction', label: 'Construction' },
  { key: 'occupants', label: 'Maximum Number Of Occupants' },
  { key: 'sleeping', label: 'Sleeping Accommodation', type: 'select', options: ['No', 'Yes'] },
  { key: 'atRisk', label: 'People Especially At Risk' },
  { key: 'responsible', label: 'Responsible Person' },
  { key: 'evacuation', label: 'Evacuation Strategy', type: 'select', options: ['Simultaneous', 'Phased', 'Stay Put', 'Progressive Horizontal', 'Defend In Place'] },
  { key: 'previous', label: 'Previous FRA Date' }
];

const FRA_SECTIONS = [
  { key: 'electrical', title: 'Electrical Sources Of Ignition', questions: [
    ['eicr', 'Fixed electrical installation inspected within the last 5 years (EICR)'],
    ['pat', 'Portable appliances tested / inspected at suitable intervals'],
    ['leads', 'Extension leads and adaptors used safely (no daisy-chaining or overloading)']
  ]},
  { key: 'smoking', title: 'Smoking', questions: [
    ['policy', 'Suitable smoking policy in place and enforced'],
    ['area', 'Designated smoking area safely located with suitable bins']
  ]},
  { key: 'arson', title: 'Arson', questions: [
    ['secure', 'Premises reasonably secure against unauthorised entry'],
    ['bins', 'Bins and combustibles stored away from the building (≥ 6 m or in a secure store)']
  ]},
  { key: 'heating', title: 'Heating, Cooking And Other Ignition Sources', questions: [
    ['fixed', 'Fixed heating / boilers serviced annually'],
    ['portable', 'Portable heaters avoided or controlled'],
    ['cooking', 'Cooking areas and extract ducts kept clean and safe'],
    ['lightning', 'Lightning protection provided where needed']
  ]},
  { key: 'housekeeping', title: 'Housekeeping', questions: [
    ['combustibles', 'Combustible materials kept to a minimum and stored safely'],
    ['routes', 'Escape routes kept free of storage and obstructions'],
    ['waste', 'Waste removed regularly']
  ]},
  { key: 'contractors', title: 'Contractors And Hot Work', questions: [
    ['permit', 'Hot work permit system in use'],
    ['control', 'Contractors briefed and supervised on fire precautions']
  ]},
  { key: 'substances', title: 'Dangerous Substances', questions: [
    ['stored', 'Flammable / dangerous substances minimised and stored correctly (DSEAR / COSHH)']
  ]},
  { key: 'escape', title: 'Means Of Escape', questions: [
    ['exits', 'Adequate number of exits for the number of occupants'],
    ['travel', 'Travel distances reasonable'],
    ['protected', 'Escape routes and stairs adequately protected'],
    ['opening', 'Exit doors open easily, without a key, in the direction of escape where needed'],
    ['final', 'Final exits lead to a place of safety'],
    ['inner', 'Inner rooms and dead ends suitably managed']
  ]},
  { key: 'doors', title: 'Fire Doors And Compartmentation', questions: [
    ['doors', 'Fire doors in good condition and self-closing (see fire door schedule)'],
    ['compartment', 'Compartment walls and floors intact — no unsealed holes or penetrations'],
    ['voids', 'Roof voids, risers and service ducts fire-stopped']
  ]},
  { key: 'lighting', title: 'Emergency Escape Lighting', questions: [
    ['provided', 'Emergency lighting provided where required'],
    ['monthly', 'Monthly function tests recorded'],
    ['annual', 'Annual full-duration test carried out']
  ]},
  { key: 'signs', title: 'Fire Safety Signs And Notices', questions: [
    ['exit', 'Fire exit signage adequate'],
    ['notices', 'Fire action notices displayed']
  ]},
  { key: 'detection', title: 'Fire Detection And Warning', questions: [
    ['system', 'Suitable fire detection and alarm system for the premises'],
    ['weekly', 'Weekly alarm tests recorded (rotating call points)'],
    ['service', 'System serviced by a competent person every 6 months']
  ]},
  { key: 'firefighting', title: 'Fire-Fighting Equipment', questions: [
    ['provided', 'Appropriate extinguishers / blankets provided'],
    ['serviced', 'Extinguishers serviced annually'],
    ['trained', 'Staff trained in their use where expected to use them']
  ]},
  { key: 'management', title: 'Management Of Fire Safety', questions: [
    ['responsible', 'Responsible person and fire safety arrangements identified'],
    ['plan', 'Emergency plan in place and up to date'],
    ['training', 'Staff fire training given at induction and refreshed'],
    ['drills', 'Fire drills carried out at least annually'],
    ['peeps', 'PEEPs in place for anyone who needs help to escape'],
    ['logbook', 'Fire safety log book kept up to date'],
    ['cooperation', 'Co-operation with other responsible persons in shared premises']
  ]}
];

const FRA_LIKELIHOOD = ['Low', 'Medium', 'High'];
const FRA_CONSEQUENCE = ['Slight Harm', 'Moderate Harm', 'Extreme Harm'];
const FRA_MATRIX = {
  'Low|Slight Harm': 'Trivial', 'Low|Moderate Harm': 'Tolerable', 'Low|Extreme Harm': 'Moderate',
  'Medium|Slight Harm': 'Tolerable', 'Medium|Moderate Harm': 'Moderate', 'Medium|Extreme Harm': 'Substantial',
  'High|Slight Harm': 'Moderate', 'High|Moderate Harm': 'Substantial', 'High|Extreme Harm': 'Intolerable'
};
const FRA_ACTION_GUIDE = {
  Trivial: 'No action is required and no detailed records need be kept.',
  Tolerable: 'No major additional controls required. There may be a need for improvements involving minor or limited cost.',
  Moderate: 'It is essential that efforts are made to reduce the risk. Risk reduction measures should be implemented within a defined time period.',
  Substantial: 'Considerable resources might have to be allocated to reduce the risk. Urgent action should be taken.',
  Intolerable: 'Premises (or relevant area) should not be occupied until the risk is reduced.'
};

/* ---------- From the HM Government "Fire Safety Risk Assessment" guides (2006):
   Offices and Shops; Transport Premises and Facilities. Figures below are the guides'
   suggested values — they are flexible and depend on the risk assessment. ---------- */
const FRA_GUIDE_REF = 'HM Government Fire Safety Risk Assessment guides (2006): Offices and Shops; Transport Premises and Facilities';

const FRA_PREMISES = [
  ['general', 'General Premises'],
  ['offices', 'Offices & Shops'],
  ['transport', 'Transport Premises (Depots, Garages, Terminals)']
];

// Extra questions from the guides' step checklists, added to the matching sections.
const FRA_GUIDE_EXTRA = {
  detection: [
    ['audible', 'Alarm can be heard and understood throughout the building when set off from any one point'],
    ['notheard', 'Arrangements for people or areas where the alarm cannot be heard (e.g. visual alarms, pagers)'],
    ['backup', 'Electrically powered detection and warning has a back-up power supply']
  ],
  firefighting: [
    ['visible', 'Extinguishers visible, or their position shown by signs'],
    ['misuse', 'Steps taken to prevent misuse or theft of extinguishers'],
    ['access', 'Clear access for fire engines and to hydrants checked daily']
  ],
  escape: [
    ['allexits', 'At least one escape route stays usable from every part of the premises if a fire blocks an exit'],
    ['everyone', 'Everyone (including disabled people and visitors) can use the escape routes safely']
  ],
  doors: [
    ['wedged', 'Staff understand fire doors must not be wedged open and escape routes must not be used for storage']
  ],
  lighting: [
    ['darkness', 'Lighting is adequate to use escape routes whenever the premises are used in darkness']
  ],
  signs: [
    ['security', 'Notices explain how to open any security devices on exit doors'],
    ['fireservice', 'Signs for the fire and rescue service (e.g. valves, electrical cut-offs, hazardous stores) maintained']
  ],
  management: [
    ['visitors', 'Visitors, temporary/agency staff and contractors know what to do in a fire'],
    ['competent', 'Fire safety equipment is tested and maintained by competent people'],
    ['records', 'Training, drills, tests and maintenance are recorded (log book)'],
    ['hazardtraining', 'Staff using or storing hazardous substances are trained in the risks'],
    ['planavailable', 'Emergency plan is available to staff and to the enforcing authority']
  ]
};
for (const s of FRA_SECTIONS) for (const q of FRA_GUIDE_EXTRA[s.key] || []) if (!s.questions.some(x => x[0] === q[0])) s.questions.push(q);

// Questions that only apply to a type of premises.
const FRA_PREMISES_SECTIONS = {
  transport: { key: 'transport', title: 'Transport Premises — Vehicles, Fuel And Workshops', questions: [
    ['nosmoking', 'Smoking prohibited where vehicles are maintained or refuelled'],
    ['flammables', 'Flammable liquids kept to a minimum; up to 50 litres in a fire-resisting cabinet or bin, more in a separate store'],
    ['atex', 'Electrical equipment in fuel / vapour areas is suitable for flammable atmospheres'],
    ['tanks', 'Fuel tanks suitably designed, preferably outdoors, and protected from fire and vehicle impact'],
    ['lpg', 'LPG kept to a minimum; cylinders (full and empty) stored securely in the open air or a ventilated store'],
    ['hotwork', 'Hot work (welding, cutting, grinding) controlled by a permit, with the area checked for at least an hour afterwards'],
    ['spills', 'Fuel and oil spills cleaned up promptly; drip trays and absorbent available'],
    ['parking', 'Vehicles parked so they do not block escape routes, exits, hydrants or fire service access'],
    ['charging', 'Battery charging areas ventilated, away from combustibles, with chargers maintained'],
    ['waste', 'Oily rags and workshop waste kept in closed metal bins and removed regularly']
  ] },
  offices: { key: 'offices', title: 'Offices & Shops — Storage, Display And Waste', questions: [
    ['understairs', 'Nothing stored under stairs or in escape routes and lobbies'],
    ['display', 'Displays, stock and furniture do not narrow escape routes or hide exits and signs'],
    ['packaging', 'Packaging and waste removed regularly and not left near the building'],
    ['electrical', 'Office equipment switched off when not in use and not overloading sockets'],
    ['seasonal', 'Seasonal or temporary displays and decorations assessed for fire risk']
  ] }
};

function fraSectionsFor(a) {
  const extra = FRA_PREMISES_SECTIONS[a && a.premisesType];
  return extra ? [...FRA_SECTIONS, extra] : FRA_SECTIONS;
}

const FRA_RISK_LEVELS = [
  ['higher', 'Higher Risk', 'Higher fire risk: e.g. flammable materials, fuel, workshops, sleeping or many people unfamiliar with the building'],
  ['normal', 'Normal Risk', 'Normal fire risk: most offices, shops and passenger areas'],
  ['lower', 'Lower Risk', 'Lower fire risk: only in exceptional cases — few people who know the building well, very little to burn']
];

// Guide Table 2: suggested maximum travel distance (m) to a storey exit, protected stair or final exit.
const TRAVEL_LIMITS = {
  other:  { multiple: { higher: 25, normal: 45, lower: 60 }, single: { higher: 12, normal: 18, lower: 25 } },
  seated: { multiple: { higher: 20, normal: 32, lower: 45 }, single: { higher: 10, normal: 15, lower: 18 } }   // transport: seating in rows
};

/* Number of people an exit of this clear width can take (guide figures):
   750 mm → 80 / 100 / 120 people, 1050 mm → 160 / 200 / 240 (higher / normal / lower risk),
   plus 15 people for each extra 75 mm. */
function exitCapacity(widthMm, level) {
  const w = Number(widthMm) || 0;
  const base = { higher: [80, 160], normal: [100, 200], lower: [120, 240] }[level || 'normal'];
  if (w < 750) return 0;
  if (w < 1050) return base[0] + Math.floor((w - 750) / 75) * 15;
  return base[1] + Math.floor((w - 1050) / 75) * 15;
}

/* Guide: Class A risk → one water-based extinguisher per ~200 m², at least two per floor;
   possibly one in very small premises under 90 m². */
function extinguishersNeeded(areaM2) {
  const a = Number(areaM2) || 0;
  if (!a) return 0;
  if (a < 90) return 1;
  return Math.max(2, Math.ceil(a / 200));
}
const EXTINGUISHER_MAX_TRAVEL = 30;

/* ---------- Fire safety maintenance checks (guide Appendix A1) ---------- */
const MAINT_FREQ = [
  ['daily', 'Daily', 1, 'days'], ['weekly', 'Weekly', 7, 'days'], ['monthly', 'Monthly', 1, 'months'],
  ['quarterly', 'Three-Monthly', 3, 'months'], ['sixmonthly', 'Six-Monthly', 6, 'months'], ['annual', 'Annual', 12, 'months']
];
const MAINT_CHECKS = {
  daily: [
    ['Escape Routes', 'exitsopen', 'All fire exits open immediately and easily (no bolts, padlocks or chains)'],
    ['Escape Routes', 'doorsclear', 'Fire doors clear of obstructions'],
    ['Escape Routes', 'routesclear', 'Escape routes clear of obstructions and combustibles'],
    ['Fire Warning System', 'panel', 'Fire alarm panel shows "normal"'],
    ['Fire Warning System', 'manual', 'Whistles, gongs or air horns in place (where used)'],
    ['Escape Lighting', 'fittings', 'Emergency light fittings and exit signs in good condition'],
    ['Escape Lighting', 'working', 'Emergency and sign lighting working (maintained fittings lit)'],
    ['Firefighting Equipment', 'inplace', 'All fire extinguishers in place'],
    ['Firefighting Equipment', 'visible', 'Fire extinguishers clearly visible'],
    ['Firefighting Equipment', 'hydrants', 'No vehicles blocking fire hydrants or access to them']
  ],
  weekly: [
    ['Escape Routes', 'fastenings', 'Emergency fastenings on fire exits (push bars, pads) work correctly'],
    ['Escape Routes', 'external', 'External escape routes clear and safe'],
    ['Fire Warning System', 'callpoint', 'Testing a manual call point signals the panel (receiving centre told first)'],
    ['Fire Warning System', 'alarmok', 'Alarm system worked correctly when tested'],
    ['Fire Warning System', 'heard', 'Staff and others heard the alarm'],
    ['Fire Warning System', 'linked', 'Linked systems operated (e.g. door holders released, smoke curtains dropped)'],
    ['Fire Warning System', 'visual', 'Visual / vibrating alarms and pagers work (where fitted)'],
    ['Fire Warning System', 'voice', 'Voice alarm works and the message was understood (where fitted)'],
    ['Escape Lighting', 'charging', 'Charging indicators visible on emergency lights (where fitted)'],
    ['Firefighting Equipment', 'condition', 'All firefighting equipment in good condition']
  ],
  monthly: [
    ['Escape Routes', 'electronic', 'Electronic release mechanisms on escape doors work and fail safe open'],
    ['Escape Routes', 'autodoors', 'Automatic doors on escape routes fail safe open'],
    ['Escape Routes', 'seals', 'Fire door seals and self-closers in good condition'],
    ['Escape Routes', 'shutters', 'Fire compartment roller shutters work correctly'],
    ['Escape Routes', 'extstairs', 'External escape stairs safe'],
    ['Escape Routes', 'selfclose', 'Internal self-closing fire doors work correctly'],
    ['Escape Lighting', 'functiontest', 'All emergency lights and exit signs work on a function test'],
    ['Escape Lighting', 'generator', 'Emergency generators tested (normally run for one hour)'],
    ['Firefighting Equipment', 'pressure', 'Stored-pressure extinguishers show correct pressure']
  ],
  quarterly: [
    ['General', 'tanks', 'Emergency water tanks / ponds at normal level'],
    ['General', 'hydrants', 'No vehicles blocking fire hydrants or access to them']
  ],
  sixmonthly: [
    ['General', 'lifts', 'Firefighting / evacuation lifts tested by a competent person'],
    ['General', 'sprinklers', 'Sprinkler system tested by a competent person'],
    ['General', 'compartment', 'Release and closing of fire-resisting compartment doors and shutters tested by a competent person'],
    ['Fire Warning System', 'service', 'Fire alarm system serviced by a competent person'],
    ['Escape Lighting', 'third', 'Emergency lights run for one third of their rated duration on test (where required)']
  ],
  annual: [
    ['Escape Routes', 'doorsfit', 'All self-closing fire doors fit correctly'],
    ['Escape Routes', 'compartmentation', 'Escape route compartmentation in good repair'],
    ['Escape Lighting', 'fullduration', 'All emergency lights run for their full rated duration on test'],
    ['Escape Lighting', 'elcompetent', 'Emergency lighting system checked by a competent person'],
    ['Firefighting Equipment', 'extservice', 'All firefighting equipment serviced by a competent person'],
    ['Miscellaneous', 'risingmain', 'Dry / wet rising mains tested by a competent person'],
    ['Miscellaneous', 'smokevent', 'Smoke and heat ventilation tested by a competent person'],
    ['Miscellaneous', 'access', 'External access for the fire service still available'],
    ['Miscellaneous', 'switches', "Firefighters' switches tested"],
    ['Miscellaneous', 'bypass', 'Fire hydrant bypass flow valve tested by a competent person'],
    ['Miscellaneous', 'fesigns', 'Fire engine direction signs in place']
  ]
};

/* ---------- Fire safety systems on a site (what is installed, who maintains it, what records exist).
   'ask' is how the question is put to the client in an information request. ---------- */
const YNU = ['Yes', 'No', 'Not Known'];
const SYSTEM_GROUPS = [
  { key: 'alarm', title: 'Fire Alarm And Detection', fields: [
    { key: 'present', label: 'Fire Alarm System Installed', type: 'select', options: YNU, ask: 'Is there a fire alarm system?' },
    { key: 'type', label: 'System Type', type: 'select', options: ['Conventional', 'Addressable', 'Wireless', 'Hybrid (Wired + Wireless)', 'Interlinked Domestic Alarms (BS 5839-6)', 'Manual Only (Call Points / Bells)', 'Not Known'], ask: 'What type of system is it (conventional, addressable or wireless)?' },
    { key: 'category', label: 'BS 5839-1 Category', type: 'select', options: ['M (Manual Only)', 'L1', 'L2', 'L3', 'L4', 'L5', 'P1', 'P2', 'Not Known'], ask: 'What category is the system designed to (e.g. L2, L3, M)? This is on the installation or commissioning certificate.' },
    { key: 'panel', label: 'Panel Make And Model', type: 'text', ask: 'What is the make and model of the fire alarm panel?' },
    { key: 'panelLocation', label: 'Panel Location', type: 'text', ask: 'Where is the fire alarm panel?' },
    { key: 'zones', label: 'Number Of Zones', type: 'number', ask: 'How many zones does the system have?' },
    { key: 'zonePlan', label: 'Zone Plan Displayed At Panel', type: 'select', options: YNU, ask: 'Is a zone plan displayed next to the panel?' },
    { key: 'detectors', label: 'Detector Types', type: 'text', placeholder: 'e.g. smoke in offices, heat in workshop, beam in roof', ask: 'What detectors are fitted, and where (smoke, heat, beam detectors)?' },
    { key: 'notCovered', label: 'Areas Without Detection', type: 'text', ask: 'Are there any areas without automatic detection (e.g. the workshop, stores, roof voids)?' },
    { key: 'monitored', label: 'Monitored By Alarm Receiving Centre', type: 'select', options: YNU, ask: 'Is the alarm monitored by an alarm receiving centre? If so, which company?' },
    { key: 'monitoringCo', label: 'Monitoring Company', type: 'text' },
    { key: 'linked', label: 'Linked Systems', type: 'text', placeholder: 'e.g. door holders, maglocks release, gas / plant shut-off', ask: 'Does the alarm release door holders or magnetic locks, or shut down plant or gas?' },
    { key: 'maintainer', label: 'Maintained By', type: 'text', ask: 'Which company services the fire alarm, and who is the contact?' },
    { key: 'lastService', label: 'Last Service Date', type: 'date', ask: 'When was the fire alarm last serviced? Please send the latest service certificate.' },
    { key: 'serviceMonths', label: 'Serviced Every (Months)', type: 'select', options: ['3', '6', '12'], ask: '' },
    { key: 'weeklyTests', label: 'Weekly Call Point Tests Recorded', type: 'select', options: YNU, ask: 'Is the alarm tested weekly from a different call point, and recorded in a log book?' },
    { key: 'certificate', label: 'Installation / Commissioning Certificate Seen', type: 'select', options: YNU, ask: 'Do you hold the installation and commissioning certificates for the system?' },
    { key: 'falseAlarms', label: 'False Alarms In Last 12 Months', type: 'number', ask: 'How many false alarms have there been in the last 12 months?' },
    { key: 'defects', label: 'Known Faults Or Defects', type: 'textarea', ask: 'Are there any known faults, or items flagged on the last service report?' }
  ] },
  { key: 'el', title: 'Emergency Lighting', fields: [
    { key: 'present', label: 'Emergency Lighting Installed', type: 'select', options: YNU, ask: 'Is emergency lighting installed?' },
    { key: 'type', label: 'System Type', type: 'select', options: ['Self-Contained Fittings', 'Central Battery', 'Mixed', 'Not Known'], ask: 'Are the emergency lights self-contained fittings or run from a central battery?' },
    { key: 'modes', label: 'Fittings', type: 'text', placeholder: 'e.g. non-maintained bulkheads, maintained exit signs', ask: 'Which fittings are maintained (always lit) and which non-maintained?' },
    { key: 'duration', label: 'Rated Duration', type: 'select', options: ['3 Hours', '1 Hour', 'Not Known'], ask: 'What is the rated duration (1 or 3 hours)?' },
    { key: 'count', label: 'Number Of Fittings', type: 'number', ask: 'Roughly how many emergency light fittings and illuminated exit signs are there?' },
    { key: 'testMethod', label: 'Test Method', type: 'select', options: ['Key Switches', 'Self-Test Fittings', 'Addressable / Automatic Monitoring', 'Not Known'], ask: 'How are they tested: test key switches, self-test fittings or an automatic monitoring system? Where are the key switches?' },
    { key: 'keySwitches', label: 'Test Key Switch Locations', type: 'text' },
    { key: 'monthlyTests', label: 'Monthly Function Tests Recorded', type: 'select', options: YNU, ask: 'Are monthly function tests carried out and recorded?' },
    { key: 'lastAnnual', label: 'Last Annual Full-Duration Test', type: 'date', ask: 'When was the last annual full-duration (3-hour) test? Please send the certificate.' },
    { key: 'maintainer', label: 'Maintained By', type: 'text', ask: 'Which company maintains the emergency lighting?' },
    { key: 'certificate', label: 'BS 5266 Completion Certificate Seen', type: 'select', options: YNU, ask: 'Do you hold the emergency lighting completion / installation certificate (BS 5266-1)?' },
    { key: 'defects', label: 'Known Faults Or Defects', type: 'textarea', ask: 'Are any emergency lights known to be faulty?' }
  ] },
  { key: 'other', title: 'Other Fire Safety Equipment And Records', fields: [
    { key: 'extMaintainer', label: 'Extinguishers Serviced By', type: 'text', ask: 'Which company services the fire extinguishers, and when was the last service?' },
    { key: 'extLastService', label: 'Last Extinguisher Service', type: 'date' },
    { key: 'sprinklers', label: 'Sprinklers / Suppression', type: 'select', options: YNU, ask: 'Are there any sprinklers or fixed fire suppression systems (e.g. kitchen or server room)?' },
    { key: 'hoseReels', label: 'Hose Reels / Dry Riser', type: 'select', options: YNU, ask: 'Are there any hose reels, or a dry / wet riser?' },
    { key: 'smokeVents', label: 'Smoke Vents / AOVs', type: 'select', options: YNU, ask: 'Are there any automatic smoke vents?' },
    { key: 'logbook', label: 'Fire Log Book Kept At', type: 'text', ask: 'Where is the fire safety log book kept?' },
    { key: 'previousFra', label: 'Previous Fire Risk Assessment', type: 'text', placeholder: 'Date and who did it', ask: 'When was the last fire risk assessment, and who carried it out? Please send a copy.' },
    { key: 'eicr', label: 'Last EICR (Fixed Wiring)', type: 'date', ask: 'When was the fixed electrical installation last inspected (EICR)?' },
    { key: 'gas', label: 'Last Gas Safety Check', type: 'date', ask: 'When were the gas appliances / heaters last serviced (if any)?' },
    { key: 'marshals', label: 'Fire Marshals / Wardens', type: 'text', ask: 'Who are your nominated fire marshals or wardens?' },
    { key: 'lastDrill', label: 'Last Fire Drill', type: 'date', ask: 'When was the last fire drill?' },
    { key: 'peeps', label: 'People Needing Help To Escape (PEEPs)', type: 'text', ask: 'Does anyone need help to evacuate (personal emergency evacuation plans)?' }
  ] }
];

/* ---------- Health & Safety Risk Assessment (HSE five steps) ---------- */
const HS_INFO = [
  { key: 'activity', label: 'Activity / Area Assessed' },
  { key: 'people', label: 'People Present (Staff, Visitors, Contractors…)' },
  { key: 'responsible', label: 'Responsible Person' }
];

const HS_PRESETS = [
  { hazard: 'Slips, trips and falls', who: 'Staff, visitors, contractors', controls: 'Good housekeeping; spills cleaned promptly; flooring maintained; cables routed safely; adequate lighting' },
  { hazard: 'Working at height', who: 'Staff, contractors', controls: 'Suitable step ladders inspected before use; work at height avoided where possible; training given' },
  { hazard: 'Manual handling', who: 'Staff', controls: 'Manual handling training; trolleys provided; heavy items stored at waist height' },
  { hazard: 'Electrical equipment', who: 'Staff, visitors', controls: 'PAT inspection and testing; EICR within 5 years; damaged items removed from use' },
  { hazard: 'Hazardous substances (COSHH)', who: 'Staff, cleaners', controls: 'COSHH assessments and data sheets held; products stored securely; PPE provided' },
  { hazard: 'Display screen equipment', who: 'Office staff', controls: 'DSE assessments completed; adjustable chairs; eye tests offered' },
  { hazard: 'Lone working', who: 'Staff working alone', controls: 'Lone working procedure; check-in system; mobile phone carried' },
  { hazard: 'Asbestos', who: 'Staff, contractors', controls: 'Asbestos register held and shared with contractors; ACMs managed and monitored' },
  { hazard: 'Legionella', who: 'Staff, visitors', controls: 'Legionella risk assessment; temperature monitoring; little-used outlets flushed weekly' },
  { hazard: 'Vehicles and car park', who: 'Pedestrians, drivers', controls: 'Speed limit signs; segregated walkways; adequate lighting' },
  { hazard: 'Stress and workload', who: 'Staff', controls: 'Regular one-to-ones; reasonable workloads; access to support' },
  { hazard: 'Gas appliances', who: 'Occupants', controls: 'Annual Gas Safe inspection; CO alarms fitted' }
];

function hsBand(score) {
  if (!score) return '';
  if (score <= 4) return 'Low';
  if (score <= 9) return 'Medium';
  if (score <= 16) return 'High';
  return 'Very High';
}
