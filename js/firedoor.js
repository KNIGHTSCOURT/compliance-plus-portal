'use strict';

/* Compliance Plus — fire door inspection, modelled on the Knights Court portal's
   fire door inspection: grouped Yes / No / Can't Verify checks, a defect record
   (what, where, fix-within, photo) for every "No", a caveat for anything that
   couldn't be checked, ten-point gap measurement, door classification and a
   computed result (Pass / Pass With Caveats / Remedial / Urgent).

   Saved as a normal inspection record, with the fire-door detail under insp.fd. */

const FD_CHECKLIST = [
  ['Certification', [
    ['certification_label_located', 'Certification label or plug is located on the door'],
    ['certification_matches_components', 'Fitted components (hinges, closer, furniture) match the door’s certification documents']
  ]],
  ['Door Closer', [
    ['closer_free_from_damage', 'Closer is free from damage and not leaking'],
    ['closer_closes_and_latches', 'Door closes fully and latches from a part-open position'],
    ['closer_marked', 'Closer is CE/UKCA marked and of adequate power size'],
    ['door_not_wedged', 'Door is free from wedges, hooks or anything holding it open, and nothing obstructs its swing']
  ]],
  ['Hinges', [
    ['hinges_minimum_three', 'At least three hinges are fitted (per leaf)'],
    ['hinges_marked', 'Hinges are CE/UKCA marked and fire-rated'],
    ['hinges_secure', 'Hinges are securely fixed with no loose or missing screws'],
    ['ironmongery_rating_matches_door', 'Fire rating of the hinges, lock and handle matches the door’s own fire rating']
  ]],
  ['Lock & Latch', [
    ['lock_latch_correct_height', 'Lock/latch is positioned between 800mm and 1200mm above the threshold'],
    ['lock_latch_marked', 'Lock/latch faceplate is CE/UKCA marked'],
    ['lock_latch_intumescent_protection', 'Intumescent protection is present around the lockset'],
    ['lock_latch_operates_smoothly', 'Lock/latch operates smoothly, the bolt engages fully, and the door does not rattle when latched or locked'],
    ['lock_latch_fixings_secure', 'All lock/latch fixings are secure and tight'],
    ['furniture_handle_operates', 'Handle operates smoothly and returns to horizontal'],
    ['escape_opens_without_key', 'Door can be opened from the escape side without a key (thumb-turn, push bar or handle)'],
    ['cupboard_kept_locked', 'Door is kept locked shut and a “Fire door keep locked” sign is displayed']
  ]],
  ['Door Leaf', [
    ['leaf_no_damage', 'Door leaf is free from visible damage'],
    ['leaf_no_deformation', 'Door leaf shows no bowing or twisting'],
    ['letterbox_openings_ok', 'Letterbox, spyhole, pet flap and vents are fire-rated or sealed, with no unapproved openings in the leaf']
  ]],
  ['Frame', [
    ['frame_intact', 'Frame is intact with no unauthorised modifications'],
    ['frame_additions_per_manufacturer', 'Any grilles, vision panels or door furniture added since installation follow the manufacturer’s instructions'],
    ['frame_fixings_correct', 'Frame fixings are correctly spaced (150mm from each corner, 450mm centres) and penetrate the wall by at least 50mm'],
    ['frame_square', 'Frame is square and true, not twisted or misaligned'],
    ['frame_rebate_correct', 'Rebate/door stop is at least 12mm thick and the correct size'],
    ['frame_no_rot_or_damage', 'Frame shows no signs of wood rot, insect damage, or over-extended mortises'],
    ['frame_wall_gap_sealed', 'Gap between the frame and the surrounding wall is filled and sealed, with no visible gaps or cracks']
  ]],
  ['Smoke Seals', [
    ['cold_smoke_seals', 'Cold smoke seals are fitted around the door and frame, continuous and undamaged']
  ]]
];
// Follow-up questions outside the main list.
const FD_EXTRA = {
  hold_open_fitted: 'Is a hold-open device fitted?',
  hold_open_releases: 'Does it release correctly on fire-alarm activation?',
  has_glazing: 'Does the door contain any glazing?',
  vision_panel_secure: 'Vision panels are secure with no rattling or damage',
  glazing_fire_rated: 'Glazing is fire-rated and intumescent glazing seals are undamaged',
  seals_present_condition: 'Intumescent seals are present around the door/frame and in good condition',
  signage_present: 'Fire door signage is present and legible on both sides'
};
// These ask what the door HAS, so "No" is a fact, not a defect.
const FD_FACT = new Set(['hold_open_fitted', 'has_glazing']);
const FD_LABELS = (() => { const m = Object.assign({}, FD_EXTRA); FD_CHECKLIST.forEach(([, items]) => items.forEach(([id, l]) => { m[id] = l; })); return m; })();
const FD_GROUP_OF = (() => {
  const m = {};
  FD_CHECKLIST.forEach(([g, items]) => items.forEach(([id]) => { m[id] = g; }));
  Object.assign(m, { hold_open_fitted: 'Door Closer', hold_open_releases: 'Door Closer', has_glazing: 'Vision Panels & Glazing', vision_panel_secure: 'Vision Panels & Glazing', glazing_fire_rated: 'Vision Panels & Glazing', seals_present_condition: 'Gaps & Seals', signage_present: 'Signage' });
  return m;
})();
const FD_REPORT_ORDER = ['Certification', 'Door Closer', 'Hinges', 'Lock & Latch', 'Door Leaf', 'Frame', 'Smoke Seals', 'Vision Panels & Glazing', 'Gaps & Seals', 'Signage'];

const FD_DEFECT_OPTIONS = {
  certification_label_located: ['No label or plug found on the door edge', 'Label painted over', 'Label damaged or illegible', 'Label is not from a recognised third-party scheme'],
  certification_matches_components: ['Hinges do not match the certified specification', 'Closer does not match the certified specification', 'Door furniture does not match the certified specification', 'No certification documents available'],
  closer_free_from_damage: ['Closer body leaking oil', 'Closer arm bent or damaged', 'Closer loose on its fixings', 'Closer missing', 'Closer cover missing or damaged'],
  closer_closes_and_latches: ['Door does not close fully', 'Door does not latch', 'Door closes too slowly', 'Door slams shut', 'Door sticks or binds on the frame or floor', 'Closer needs adjusting'],
  closer_marked: ['No CE/UKCA marking visible on the closer', 'Closer too weak for the door', 'Closer wrong size for the door'],
  hinges_minimum_three: ['Only two hinges fitted', 'Hinge missing', 'Hinges unevenly spaced'],
  hinges_marked: ['Hinges not CE/UKCA marked', 'Hinges not fire-rated', 'Lightweight (non-fire-rated) hinges fitted'],
  hinges_secure: ['Loose screws', 'Missing screws', 'Wrong type of screws', 'Hinge pulling away from the frame or leaf', 'Hinge worn or sagging'],
  ironmongery_rating_matches_door: ['Lock has a lower fire rating than the door', 'Hinges have a lower fire rating than the door', 'Handle or furniture is not fire-rated'],
  lock_latch_correct_height: ['Lock/latch too low', 'Lock/latch too high'],
  lock_latch_marked: ['Faceplate not CE/UKCA marked', 'Faceplate missing'],
  lock_latch_intumescent_protection: ['No intumescent protection around the lock', 'Intumescent protection damaged or painted over', 'Lock case cut too large for the door'],
  lock_latch_operates_smoothly: ['Latch does not engage fully', 'Bolt sticks', 'Door rattles when latched', 'Lock stiff or jammed'],
  lock_latch_fixings_secure: ['Loose fixings', 'Missing fixings'],
  furniture_handle_operates: ['Handle loose', 'Handle droops and does not return', 'Handle stiff', 'Handle missing'],
  escape_opens_without_key: ['Needs a key to open from the escape side', 'Thumb-turn missing or faulty', 'Push bar or handle not working', 'Door stiff or difficult to open'],
  cupboard_kept_locked: ['Door found unlocked', 'Lock missing or not working', 'Keep-locked sign missing', 'Key held by people who should not have it'],
  leaf_no_damage: ['Holes or drilled penetrations', 'Splits or cracks', 'Delamination or water damage', 'Burn marks', 'Impact damage or dents', 'Poorly filled repair'],
  leaf_no_deformation: ['Door bowed', 'Door twisted', 'Door warped'],
  letterbox_openings_ok: ['Letterbox is not fire-rated', 'Letterbox has no intumescent liner or fire hood', 'Spyhole not fire-rated', 'Pet flap fitted', 'Air vent or grille fitted', 'Unapproved hole in the leaf'],
  frame_intact: ['Unauthorised modification', 'Frame cut or notched', 'Poor repair to the frame', 'Frame damaged'],
  frame_additions_per_manufacturer: ['Grille added without approval', 'Vision panel added without approval', 'Letterbox or furniture added without approval'],
  frame_fixings_correct: ['Fixings too far apart', 'Fixings missing', 'Fixings do not penetrate the wall enough', 'Frame loose in the opening'],
  frame_square: ['Frame twisted', 'Frame out of square', 'Frame and door misaligned'],
  frame_rebate_correct: ['Door stop too thin', 'Door stop damaged or missing', 'Door stop the wrong size'],
  frame_no_rot_or_damage: ['Wood rot', 'Insect damage', 'Mortise over-extended', 'Water damage'],
  frame_wall_gap_sealed: ['Gap between frame and wall not filled', 'Cracked or missing filler', 'Gap sealed with an unsuitable material', 'Frame loose in the opening'],
  cold_smoke_seals: ['Cold smoke seal missing', 'Seal broken or not continuous', 'Seal painted over', 'Seal damaged or peeling', 'Seal missing at the head or threshold'],
  door_not_wedged: ['Door wedged open', 'Held open with a hook, chair or other object', 'Items stored in the door swing', 'Door propped open'],
  hold_open_releases: ['Does not release on alarm', 'Release is delayed', 'Device faulty'],
  vision_panel_secure: ['Glazing rattles', 'Glazing cracked or damaged', 'Beading loose or missing'],
  glazing_fire_rated: ['Glass is not fire-rated', 'Intumescent glazing seal damaged', 'Glazing seal missing'],
  seals_present_condition: ['Intumescent strip missing', 'Cold smoke seal missing', 'Seal damaged or painted over', 'Seal loose or peeling', 'Seal only on part of the door'],
  signage_present: ['Sign missing on one side', 'Sign missing on both sides', 'Sign damaged or illegible', 'Wrong sign']
};
const FD_CAVEAT_REASONS = ['Obscured by architrave or trim', 'Painted over', 'Hidden behind other fittings', 'Not accessible', 'Door cannot be opened or tested (in use)', 'Not safe to test', 'Component cannot be seen without removing it'];
const FD_WHERE = ['Door leaf - hinge side', 'Door leaf - latch side', 'Door leaf - face (both sides)', 'Top of door (head)', 'Bottom of door (threshold)', 'Meeting stiles', 'Frame - head', 'Frame - hinge jamb', 'Frame - latch jamb', 'Closer', 'Hinges', 'Lock / latch', 'Handle / furniture', 'Glazing / vision panel', 'Seals', 'Whole door'];
const FD_TIMESCALES = [['Immediate', 'Immediately (within 24 hours)'], ['1 month', 'Within 1 month'], ['3 months', 'Within 3 months'], ['12 months', 'Within 12 months']];
const FD_EVIDENCE_ON_YES = new Set(['certification_label_located']);
const FD_RESULTS = {
  'Pass': 'pass', 'Pass with caveats': 'advisory', 'Remedial action required': 'fail', 'Urgent action required': 'fail'
};

// Ten points for a single door (2 head, 3 per jamb, 2 threshold); a double door adds the meeting stiles.
const FD_GAP_KEYS = [
  ['top_left', 'Head · hinge side'], ['top_right', 'Head · latch side'],
  ['left_top', 'Hinge jamb · top'], ['left_mid', 'Hinge jamb · middle'], ['left_bottom', 'Hinge jamb · bottom'],
  ['right_top', 'Latch jamb · top'], ['right_mid', 'Latch jamb · middle'], ['right_bottom', 'Latch jamb · bottom'],
  ['bottom_left', 'Threshold · hinge side'], ['bottom_right', 'Threshold · latch side']
];
const FD_GAP_KEYS_DOUBLE = [['meet_top', 'Meeting stiles · top'], ['meet_mid', 'Meeting stiles · middle'], ['meet_bottom', 'Meeting stiles · bottom']];

function fdGapKeysFor(fd) { return fd && fd.config === 'Double Leaf' ? [...FD_GAP_KEYS, ...FD_GAP_KEYS_DOUBLE] : FD_GAP_KEYS; }
// Head, jambs and meeting stiles 2–4 mm (BS 8214). Threshold: 3 mm max for a smoke-control door, otherwise 10 mm.
function fdGapTolerance(id, fd) { return id.startsWith('bottom_') ? [0, fd && fd.smoke === 'No' ? 10 : 3] : [2, 4]; }
function fdGapOut(id, v, fd) { const [a, b] = fdGapTolerance(id, fd); return Number(v) < a || Number(v) > b; }
function fdHas(v) { return v !== undefined && v !== null && v !== ''; }
function fdMinThickness(fd) { return /^FD(60|90|120)/.test((fd && fd.rating) || '') ? 54 : 44; }

const FD_GROUP_EXPLAIN = {
  'Certification': 'A certified fire door carries a label or plug, usually in the edge of the door, showing it was tested and what protection it gives. The door only achieves that protection with the parts it was tested with.',
  'Door Closer': 'The closer is the arm or spring that shuts the door by itself every time. A fire door only protects people when it is closed, so this is the single most important part.',
  'Hinges': 'Fire door hinges are tested to carry the weight of a heavy door and to keep it aligned in a fire. At least three are needed on each leaf.',
  'Lock & Latch': 'The lock and latch hold the door shut against the pressure of fire and smoke, and must still let people out quickly without a key.',
  'Door Leaf': 'The leaf is the door itself. A fire door is built to resist fire for a set time; holes, cracks and warping all reduce that.',
  'Frame': 'The frame holds the door in the wall. If it is loose, damaged or out of square, the door cannot close properly or stay in place in a fire.',
  'Smoke Seals': 'Cold smoke seals are thin strips round the door that stop smoke leaking through the gaps.',
  'Vision Panels & Glazing': 'Glass in a fire door must be specially made fire-resisting glass held in with the right beading and seals. Ordinary glass shatters in a fire.',
  'Gaps & Seals': 'Intumescent strips swell when heated to fill the gaps around the door and stop flames passing. They only work if they are present, in one piece and not painted over, and if the gaps are the right size.',
  'Signage': 'Fire door signs remind everyone to keep the door shut, or locked, and not to wedge it open.'
};
const FD_WHY = {
  certification_label_located: 'The label or plug is the proof the door was tested. Without it the door can only be judged by eye.',
  certification_matches_components: 'Swapping a hinge, closer or lock for a different type can mean the door no longer achieves its tested protection.',
  closer_free_from_damage: 'A damaged or leaking closer may stop closing the door reliably.',
  closer_closes_and_latches: 'The door must close fully and latch every time. A door left ajar lets fire and smoke through.',
  closer_marked: 'A marked closer of the right strength has been tested to shut the door against draughts and the resistance of the latch.',
  door_not_wedged: 'A door that is wedged or blocked cannot close. Fire and smoke then spread freely.',
  hinges_minimum_three: 'Three hinges carry the weight and keep the door true. With two, the door sags and the gaps open.',
  hinges_marked: 'Ordinary hinges can melt or fail in a fire. Fire-rated hinges are tested to hold the door for its full rating.',
  hinges_secure: 'Loose or missing screws let the door drop and rub, which stops it latching.',
  ironmongery_rating_matches_door: 'Hinges, lock and handle must be rated as highly as the door. A weaker part is the weak link.',
  lock_latch_correct_height: 'A lock at the right height is where the door was designed and tested to be held shut.',
  lock_latch_marked: 'A marked lock has been tested for use on a fire door.',
  lock_latch_intumescent_protection: 'The hole cut for the lock weakens the door. Intumescent material around it swells in a fire and closes that weak point.',
  lock_latch_operates_smoothly: 'The bolt must engage fully and the door must not rattle, otherwise it can be pushed open by fire pressure.',
  lock_latch_fixings_secure: 'Loose lock fixings can let the lock work free from the door.',
  furniture_handle_operates: 'A handle that sticks or droops can stop the latch engaging.',
  escape_opens_without_key: 'In a fire people must be able to get out quickly without hunting for a key.',
  cupboard_kept_locked: 'Service cupboards and risers must be kept locked so nobody stores things or tampers with the equipment inside.',
  leaf_no_damage: 'Holes, splits and burns reduce the time the door can hold back a fire.',
  leaf_no_deformation: 'A bowed or twisted door does not meet the frame evenly, so the seals cannot do their job.',
  letterbox_openings_ok: 'Every opening in the door is a gap for fire and smoke. Letterboxes, spyholes, pet flaps and vents must be fire-rated or sealed.',
  frame_intact: 'Cuts, notches and bad repairs weaken the frame and the door set.',
  frame_additions_per_manufacturer: 'Anything added after installation must follow the manufacturer’s instructions, or it can undo the door’s rating.',
  frame_fixings_correct: 'The frame must be fixed firmly to the wall so it stays put when the door is pushed by fire.',
  frame_square: 'A frame that is out of square leaves uneven gaps and stops the door closing evenly.',
  frame_rebate_correct: 'The stop the door closes against must be thick enough to hold the seals and stop fire passing.',
  frame_no_rot_or_damage: 'Rot, insects and water damage weaken the frame and the fixings.',
  frame_wall_gap_sealed: 'A gap between the frame and the wall is a route for fire and smoke around the door.',
  cold_smoke_seals: 'Smoke is the main danger to people in a fire. These seals stop it leaking round a closed door.',
  hold_open_fitted: 'Tells us whether the door is meant to be held open, and by what.',
  hold_open_releases: 'A hold-open device that does not release when the alarm sounds leaves the door open in a fire.',
  has_glazing: 'Tells us whether the door has a window, which needs its own checks.',
  vision_panel_secure: 'Loose or damaged glazing can fall out in a fire and leave a hole.',
  glazing_fire_rated: 'Only fire-resisting glass and seals protect people. Ordinary glass shatters.',
  signage_present: 'Signs remind people to keep the door shut and not to wedge it open.',
  seals_present_condition: 'Missing, torn or painted-over strips leave gaps that fire and smoke can pass through.'
};

/* ---------- Which questions apply to this door ---------- */
function fdDoorKind(it) {
  const use = (it.details || {}).use || '';
  const text = `${it.name || ''} ${use}`;
  if (/flat entrance/i.test(use)) return 'flat';
  if (/plant|riser|cupboard|meter|cleaner|service/i.test(text)) return 'cupboard';
  return 'escape';
}
function fdApplies(id, it, fd, answers) {
  const kind = fdDoorKind(it);
  if (id === 'certification_matches_components') return fd.classification !== 'Nominal';
  if (id === 'letterbox_openings_ok') return kind === 'flat';
  if (id === 'escape_opens_without_key') return kind !== 'cupboard';
  if (id === 'cupboard_kept_locked') return kind === 'cupboard';
  if (id === 'cold_smoke_seals') return fd.smoke !== 'No';
  if (id === 'signage_present') return kind !== 'flat';
  if (id === 'hold_open_releases') return (answers.hold_open_fitted || {}).v === 'yes';
  if (id === 'vision_panel_secure' || id === 'glazing_fire_rated') return (answers.has_glazing || {}).v === 'yes';
  return true;
}
function fdAllIds() {
  return [...FD_CHECKLIST.flatMap(([, items]) => items.map(([id]) => id)), 'hold_open_fitted', 'hold_open_releases', 'has_glazing', 'vision_panel_secure', 'glazing_fire_rated', 'seals_present_condition', 'signage_present'];
}

/* Result, as on the Knights Court inspection. */
function fdComputeResult(it, insp) {
  const fd = insp.fd || {}, ans = insp.answers || {};
  const v = id => (ans[id] || {}).v;
  const applies = id => fdApplies(id, it, fd, ans);
  if (applies('hold_open_releases') && v('hold_open_releases') === 'no') return 'Urgent action required';
  if (v('door_not_wedged') === 'no') return 'Urgent action required';
  const failing = fdAllIds().filter(id => !FD_FACT.has(id) && applies(id) && v(id) === 'no');
  if (failing.some(id => ((fd.defects || {})[id] || {}).timescale === 'Immediate')) return 'Urgent action required';
  const gaps = fd.gaps || {};
  const gapsOut = fdGapKeysFor(fd).some(([id]) => fdHas(gaps[id]) && fdGapOut(id, gaps[id], fd));
  const thin = fdHas(fd.thickness) && Number(fd.thickness) < fdMinThickness(fd);
  if (failing.length || gapsOut || thin) return 'Remedial action required';
  const caveat = fdAllIds().some(id => applies(id) && v(id) === 'caveat');
  return caveat ? 'Pass with caveats' : 'Pass';
}

function fdDefectText(d) {
  if (!d) return '';
  const where = d.where === 'Other' ? (d.whereOther || 'Other') : (d.where || '');
  const when = (FD_TIMESCALES.find(([v]) => v === d.timescale) || [])[1];
  return [d.type && d.type !== 'Other' ? d.type : '', where ? `Where: ${where}` : '', d.note || '', when ? `Fix: ${when.toLowerCase()}` : ''].filter(Boolean).join(' · ');
}

/* Everything wrong with a door, as lines of text (used by schedules and reports). */
function fdFindings(it, insp) {
  const fd = insp.fd || {}, ans = insp.answers || {};
  const out = [];
  for (const id of fdAllIds()) {
    if (FD_FACT.has(id) || !fdApplies(id, it, fd, ans)) continue;
    if ((ans[id] || {}).v === 'no') out.push(`${FD_LABELS[id]}${fdDefectText((fd.defects || {})[id]) ? ' — ' + fdDefectText(fd.defects[id]) : ''}`);
  }
  const gaps = fd.gaps || {};
  for (const [id, label] of fdGapKeysFor(fd)) if (fdHas(gaps[id]) && fdGapOut(id, gaps[id], fd)) out.push(`Gap out of tolerance: ${label} ${gaps[id]} mm`);
  if (fdHas(fd.thickness) && Number(fd.thickness) < fdMinThickness(fd)) out.push(`Door thickness ${fd.thickness} mm is under the ${fdMinThickness(fd)} mm minimum for ${fd.rating || 'this rating'}`);
  return out;
}
function fdCaveats(it, insp) {
  const fd = insp.fd || {}, ans = insp.answers || {};
  return fdAllIds().filter(id => fdApplies(id, it, fd, ans) && (ans[id] || {}).v === 'caveat')
    .map(id => `${FD_LABELS[id]}${fdDefectText((fd.caveats || {})[id]) ? ' — ' + fdDefectText(fd.caveats[id]) : ''}`);
}

/* ---------- The inspection form ---------- */
function viewFireDoorInspect(itemId, inspId) {
  const it = Store.get('items', itemId);
  const site = siteOf(it);
  const existing = inspId ? Store.get('inspections', inspId) : null;
  const prev = inspectionsFor(itemId).find(x => !existing || x.id !== existing.id);
  const d = it.details || {};
  const insp = existing ? JSON.parse(JSON.stringify(existing)) : {
    itemId, siteId: it.siteId, type: it.type, date: today(), inspector: Store.settings.assessorName || '',
    answers: {}, readings: {}, photos: [], notes: '', action: '', outcome: '', intervalMonths: 6, nextDue: addMonths(today(), 6),
    fd: {
      inspectionType: 'Non-Intrusive', competence: '', prevDefects: '',
      classification: d.certification && d.certification !== 'None Found' ? 'Certificated' : '',
      rating: d.rating && d.rating !== 'Unknown' ? d.rating : '',
      smoke: /S$/.test(d.rating || '') ? 'Yes' : '', certNumber: d.manufacturer || '', thickness: '',
      config: d.config === 'Double Leaf' || d.config === 'Leaf And A Half' ? 'Double Leaf' : 'Single Leaf',
      lockType: '', gaps: {}, defects: {}, caveats: {}, evidence: {}, photoSlots: {}
    }
  };
  const fd = insp.fd;
  ['gaps', 'defects', 'caveats', 'evidence', 'photoSlots'].forEach(k => { fd[k] = fd[k] || {}; });
  const removed = [];
  let dueManual = !!existing;
  const clientId = (site || {}).clientId;
  const prevResult = prev && prev.fd ? prev.fd.result : prev ? OUTCOME_LABEL[prev.outcome] : '';
  const prevHadDefects = prev && prev.outcome && prev.outcome !== 'pass';
  setCrumbs([['Clients & Sites', '#/clients'], [site ? site.name : 'Site', site ? `#/site/${site.id}/items` : ''], [it.ref, `#/item/${itemId}`], [existing ? 'Edit Fire Door Inspection' : 'Fire Door Inspection']]);

  const opt = (list, val, blank) => `<option value="">${esc(blank)}</option>${list.map(o => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}`;
  const optOther = (list, val, blank) => opt([...list, 'Other'], val, blank);
  const photoSlot = (slot, label) => {
    const pid = fd.photoSlots[slot];
    return `<div class="fd-photo">${pid ? `<div class="ph"><img data-photo="${pid}" alt=""><button type="button" data-rmslot="${slot}" aria-label="Remove">×</button></div>` : ''}
      <label class="btn small" style="color:inherit;font-size:.85rem">${pid ? 'Replace' : '+'} ${esc(label)}<input type="file" accept="image/*" capture="environment" data-slot="${slot}" hidden></label></div>`;
  };
  const resultClass = r => r === 'Pass' ? 'b-pass' : r === 'Pass with caveats' ? 'b-advisory' : r ? 'b-fail' : 'b-untested';

  function question(id) {
    if (!fdApplies(id, it, fd, insp.answers)) return '';
    const a = insp.answers[id] || {};
    const fact = FD_FACT.has(id);
    const btns = fact ? [['yes', 'Yes'], ['no', 'No']] : [['yes', 'Yes'], ['no', 'No'], ['caveat', "Can't Verify"]];
    const cls = v => a.v === v ? (fact ? 'on-na' : v === 'yes' ? 'on-pass' : v === 'no' ? 'on-fail' : 'on-advisory') : '';
    let extra = '';
    if (!fact && a.v === 'no') {
      const df = fd.defects[id] || {};
      extra = `<div class="fd-box bad"><div class="fd-box-h">Defect — What Is Wrong, And Where</div>
        <div class="grid2">
          <div class="field"><label>Defect</label><select data-fd="defects.${id}.type">${optOther(FD_DEFECT_OPTIONS[id] || [], df.type, 'Choose A Defect')}</select></div>
          <div class="field"><label>Where On The Door</label><select data-fd="defects.${id}.where">${optOther(FD_WHERE, df.where, 'Choose A Location')}</select></div>
        </div>
        ${df.where === 'Other' ? `<div class="field"><label>Where Else On The Door?</label><input data-fd="defects.${id}.whereOther" value="${esc(df.whereOther || '')}"></div>` : ''}
        <div class="grid2">
          <div class="field"><label>Fix Within</label><select data-fd="defects.${id}.timescale"><option value="">Choose A Timescale</option>${FD_TIMESCALES.map(([v, l]) => `<option value="${v}" ${df.timescale === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>${df.type === 'Other' ? 'Describe The Defect (Required)' : 'More Details (Optional)'}</label><input data-fd="defects.${id}.note" value="${esc(df.note || '')}" placeholder="Anything else about the defect"></div>
        </div>${photoSlot('d_' + id, 'Photo Of The Defect')}</div>`;
    } else if (!fact && a.v === 'caveat') {
      const cv = fd.caveats[id] || {};
      extra = `<div class="fd-box warn"><div class="fd-box-h">Caveat — Why It Couldn't Be Verified</div>
        <div class="grid2"><div class="field"><label>Reason</label><select data-fd="caveats.${id}.type">${optOther(FD_CAVEAT_REASONS, cv.type, 'Choose A Reason')}</select></div>
        <div class="field"><label>More Details (Optional)</label><input data-fd="caveats.${id}.note" value="${esc(cv.note || '')}" placeholder="e.g. Architrave obscures the seal — not removed"></div></div>
        ${photoSlot('c_' + id, 'Photo Showing The Obstruction')}</div>`;
    } else if (a.v === 'yes' && FD_EVIDENCE_ON_YES.has(id)) {
      extra = `<div class="fd-box good"><div class="fd-box-h">Evidence — Photo Of The Certification Label/Plug</div>${photoSlot('e_' + id, 'Photo Of The Label')}</div>`;
    }
    return `<div class="check-row"><div class="q">${esc(FD_LABELS[id])}</div>
      <div class="seg" data-q="${id}">${btns.map(([v, l]) => `<button type="button" data-v="${v}" class="${cls(v)}">${l}</button>`).join('')}</div>
      ${extra ? `<div class="note">${extra}</div>` : ''}</div>`;
  }

  function gapInput(id, label) {
    const v = fd.gaps[id];
    const bad = fdHas(v) && fdGapOut(id, v, fd);
    return `<div class="fd-gap"><label>${esc(label)}</label><input type="number" step="0.5" min="0" inputmode="decimal" data-gap="${id}" value="${esc(v ?? '')}" class="${bad ? 'reading-bad' : fdHas(v) ? 'reading-ok' : ''}" placeholder="mm"></div>`;
  }

  function gapsSummary() {
    const keys = fdGapKeysFor(fd);
    const entries = keys.filter(([id]) => fdHas(fd.gaps[id]));
    if (!entries.length) return 'Not yet measured.';
    const bad = entries.filter(([id]) => fdGapOut(id, fd.gaps[id], fd)).length;
    return `${entries.length}/${keys.length} measured · ${entries.length - bad} within tolerance${bad ? ` · <b style="color:var(--fail)">${bad} out of tolerance</b>` : ''}`;
  }

  function render() {
    fd.result = fdComputeResult(it, insp);
    const unanswered = fdAllIds().filter(id => fdApplies(id, it, fd, insp.answers) && !(insp.answers[id] || {}).v).length;
    const dbl = fd.config === 'Double Leaf';
    const thr = fdGapTolerance('bottom_left', fd)[1];
    $('#view').innerHTML = `
      <div class="fd-bar card"><div class="spread"><div><div class="row">${typeChip(it.type)}<h1 style="margin:0">${esc(it.ref)}</h1><span class="badge ${resultClass(fd.result)}">${esc(fd.result)}</span></div>
        <div class="muted">${esc(itemTitle(it))} · ${esc(locationText(it))}</div></div>
        <div class="row"><a class="btn" href="#/item/${itemId}">Cancel</a><button class="btn primary" id="fdSaveTop">Save Inspection</button></div></div>
        <div class="small muted">${unanswered ? `${unanswered} question${unanswered === 1 ? '' : 's'} still to answer` : 'All questions answered'}</div></div>

      <div class="card"><h2>Door Details</h2>
        <div class="kv"><div>Door</div><div>${esc(itemTitle(it))}</div><div>Location</div><div>${esc(locationText(it))}</div>
          <div>Registered Details</div><div>${esc(detailSummary(it) || 'None recorded')}</div></div>
        <div class="fd-photos mt">${photoSlot('outside', 'Outside Of The Door')}${photoSlot('inside', 'Inside Of The Door')}${photoSlot('doorid', 'Door ID / QR Label')}</div>
        <p class="small muted">These three photos show the door as found.</p></div>

      <div class="card"><h2>Inspection Details</h2><div class="grid3">
        ${field('Inspector Name', 'inspector', insp.inspector)}
        ${field('Inspection Date', 'date', insp.date, { type: 'date' })}
        <div class="field"><label>Type Of Inspection</label><select data-fd="inspectionType">${opt(['Non-Intrusive', 'Intrusive'], fd.inspectionType, 'Choose One')}</select></div>
        <div class="field"><label>Inspector's Competence</label><select data-fd="competence">${opt(['Third-party certificated fire door inspector', 'Trained fire door inspector', 'Competent person (general fire safety)', 'Visual check only'], fd.competence, 'Choose One')}</select></div>
        ${field('Re-Inspect Every', 'intervalMonths', insp.intervalMonths, { type: 'select', blank: false, options: [[3, '3 Months'], [6, '6 Months'], [12, '12 Months']] })}
        ${field('Next Inspection Due', 'nextDue', insp.nextDue, { type: 'date' })}
        ${prev ? `<div class="field" style="grid-column:1/-1"><label>Were The Defects From The Previous Inspection Put Right?</label><select data-fd="prevDefects">${opt(['All previous defects have been rectified', 'Some previous defects are still outstanding', 'Not applicable: no previous defects'], fd.prevDefects, 'Choose One')}</select>
          <div class="small muted">Last inspected ${esc(fmtDate(prev.date))}: ${esc(prevResult || '')}${prevHadDefects ? ' — ' + esc((prev.fd ? fdFindings(it, prev) : failedChecksText(it, prev)).slice(0, 3).join('; ')) : ''}</div></div>` : ''}
      </div></div>

      <div class="card"><h2>Door Classification</h2><div class="grid3">
        <div class="field"><label>Certificated Or Nominal?</label><select data-fd="classification">${opt(['Certificated', 'Nominal'], fd.classification, 'Choose One')}</select><div class="small muted">Certificated: a label or plug was found. Nominal: no label, judged by its construction.</div></div>
        <div class="field"><label>Fire Rating</label><select data-fd="rating">${opt(['FD30', 'FD30S', 'FD60', 'FD60S', 'FD90', 'FD90S', 'FD120', 'FD120S'], fd.rating, 'Choose One')}</select><div class="small muted">"S" means the door also controls smoke.</div></div>
        <div class="field"><label>Smoke-Control (S) Door?</label><select data-fd="smoke">${opt(['Yes', 'No', 'Not Known'], fd.smoke, 'Choose One')}</select></div>
        <div class="field"><label>Single Or Double Door</label><select data-fd="config">${opt(['Single Leaf', 'Double Leaf'], fd.config, 'Choose One')}</select></div>
        ${fd.classification === 'Certificated' ? `<div class="field"><label>Certificate Number (If Known)</label><input data-fd="certNumber" value="${esc(fd.certNumber || '')}" placeholder="e.g. CF198"></div>` : ''}
        <div class="field"><label>Measured Door Thickness (mm)</label><input type="number" data-fd="thickness" value="${esc(fd.thickness || '')}" placeholder="e.g. 44" class="${fdHas(fd.thickness) && Number(fd.thickness) < fdMinThickness(fd) ? 'reading-bad' : ''}">
          <div class="small muted">At least ${fdMinThickness(fd)} mm for ${/^FD(60|90|120)/.test(fd.rating || '') ? 'FD60 and above' : 'FD30'}. A guide for a nominal door, not a substitute for certification.</div></div>
      </div></div>

      ${FD_CHECKLIST.map(([group, items]) => {
        const body = items.map(([id]) => question(id)).join('');
        const lock = group === 'Lock & Latch' ? `<div class="field" style="max-width:340px"><label>Lock / Latch Type</label><select data-fd="lockType">${opt(['Mortice deadlock', 'Tubular mortice latch', 'Cylinder rim night latch', 'Multi-point locking', 'Panic hardware (push bar / pad)', 'No lock or latch', 'Other'], fd.lockType, 'Not Recorded')}</select></div>` : '';
        const hold = group === 'Door Closer' ? question('hold_open_fitted') + question('hold_open_releases') : '';
        return body || lock || hold ? `<div class="card"><h2>${esc(group)}${group === 'Door Closer' ? ' & Hold-Open Device' : ''}</h2>${lock}${body}${hold}</div>` : '';
      }).join('')}

      <div class="card"><h2>Vision Panels & Glazing</h2>${question('has_glazing')}${question('vision_panel_secure')}${question('glazing_fire_rated')}</div>

      <div class="card"><h2>Gaps & Seals</h2>${question('seals_present_condition')}
        <h3 class="mt">Gap Measurements (mm)</h3>
        <p class="small muted">2–4 mm at the head, jambs${dbl ? ' and meeting stiles' : ''}. Threshold up to ${thr} mm${thr === 3 ? ' for a smoke-control door' : ''}. Measure with the door closed.</p>
        <div class="fd-gapgrid ${dbl ? 'double' : ''}">
          <div class="fd-gap-top">${gapInput('top_left', FD_GAP_KEYS[0][1])}${gapInput('top_right', FD_GAP_KEYS[1][1])}</div>
          <div class="fd-gap-side">${gapInput('left_top', 'Hinge · top')}${gapInput('left_mid', 'Hinge · middle')}${gapInput('left_bottom', 'Hinge · bottom')}</div>
          <div class="fd-door">${dbl ? `<div class="fd-leaf"></div><div class="fd-meet">${gapInput('meet_top', 'Meeting · top')}${gapInput('meet_mid', 'Meeting · middle')}${gapInput('meet_bottom', 'Meeting · bottom')}</div><div class="fd-leaf"></div>` : '<div class="fd-leaf">Door</div>'}</div>
          <div class="fd-gap-side">${gapInput('right_top', 'Latch · top')}${gapInput('right_mid', 'Latch · middle')}${gapInput('right_bottom', 'Latch · bottom')}</div>
          <div class="fd-gap-bottom">${gapInput('bottom_left', FD_GAP_KEYS[8][1])}${gapInput('bottom_right', FD_GAP_KEYS[9][1])}</div>
        </div>
        <p class="small" id="fdGapSum">${gapsSummary()}</p></div>

      ${fdApplies('signage_present', it, fd, insp.answers) ? `<div class="card"><h2>Signage</h2>${question('signage_present')}</div>` : ''}

      <div class="card"><h2>Defects & Actions</h2>
        ${field('Other Findings / Notes', 'notes', insp.notes, { type: 'textarea', placeholder: 'Anything else found' })}
        ${field('Recommended Action', 'action', insp.action, { type: 'textarea', placeholder: 'Work needed to put the door right (shown in the client report)' })}
        <div class="field"><label>Result (Worked Out From The Answers)</label><div><span class="badge ${resultClass(fd.result)}" style="font-size:1rem">${esc(fd.result)}</span></div></div>
      </div>
      <div class="sticky-actions">
        ${existing ? '<button class="btn danger" id="fdDel">Delete Inspection</button>' : ''}
        <button class="btn" id="fdSaveNext">Save &amp; Next Door</button>
        <button class="btn primary" id="fdSave">Save Inspection</button>
      </div>`;
    hydratePhotos($('#view'));
    bind();
  }

  function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

  function bind() {
    const v = $('#view');
    $('[name=inspector]', v).oninput = e => { insp.inspector = e.target.value; };
    $('[name=date]', v).onchange = e => { insp.date = e.target.value; if (!dueManual) insp.nextDue = addMonths(insp.date, insp.intervalMonths); keepScroll(render); };
    $('[name=intervalMonths]', v).onchange = e => { insp.intervalMonths = Number(e.target.value); dueManual = false; insp.nextDue = addMonths(insp.date, insp.intervalMonths); keepScroll(render); };
    $('[name=nextDue]', v).onchange = e => { insp.nextDue = e.target.value; dueManual = true; };
    $('[name=notes]', v).oninput = e => { insp.notes = e.target.value; };
    $('[name=action]', v).oninput = e => { insp.action = e.target.value; };
    $$('[data-q]', v).forEach(seg => $$('button', seg).forEach(b => b.onclick = () => {
      const id = seg.dataset.q;
      const a = insp.answers[id] || (insp.answers[id] = {});
      a.v = a.v === b.dataset.v ? '' : b.dataset.v;
      keepScroll(render);
    }));
    $$('[data-fd]', v).forEach(el => {
      const path = el.dataset.fd;
      const redraw = el.tagName === 'SELECT' || path === 'thickness';
      el.addEventListener(redraw ? 'change' : 'input', () => {
        setPath(fd, path, el.value);
        if (path === 'rating' && /S$/.test(el.value) && !fd.smoke) fd.smoke = 'Yes';
        if (redraw) keepScroll(render);
      });
    });
    $$('[data-gap]', v).forEach(el => el.onchange = () => { fd.gaps[el.dataset.gap] = el.value; keepScroll(render); });
    $$('[data-slot]', v).forEach(el => el.onchange = async () => {
      const f = el.files[0]; if (!f) return;
      const url = await compressImage(f, 1600, 0.8); if (!url) return;
      const old = fd.photoSlots[el.dataset.slot]; if (old) removed.push(old);
      fd.photoSlots[el.dataset.slot] = await Store.putPhoto(url, clientId);
      keepScroll(render);
    });
    $$('[data-rmslot]', v).forEach(b => b.onclick = () => { removed.push(fd.photoSlots[b.dataset.rmslot]); delete fd.photoSlots[b.dataset.rmslot]; keepScroll(render); });
    $('#fdSave', v).onclick = $('#fdSaveTop', v).onclick = () => { if (save()) go(`#/item/${itemId}`); };
    $('#fdSaveNext', v).onclick = () => {
      if (!save()) return;
      const doors = Store.list('items').filter(i => i.siteId === it.siteId && !i.archived && i.type === 'fire-door').sort((a, b) => a.ref.localeCompare(b.ref));
      const idx = doors.findIndex(i => i.id === itemId);
      const next = doors.slice(idx + 1).concat(doors.slice(0, idx)).find(i => { const st = itemState(i); return !st.last || st.last.date !== insp.date; });
      if (next) go(`#/inspect/${next.id}`); else { toast('Every fire door on this site has been inspected today'); go(`#/site/${it.siteId}/items`); }
    };
    const del = $('#fdDel', v);
    if (del) del.onclick = async () => {
      if (await confirmBox('Delete Inspection', 'Delete this fire door inspection and its photos?')) {
        (existing.photos || []).forEach(p => Store.deletePhoto(p));
        Store.remove('inspections', existing.id); invalidateState(); go(`#/item/${itemId}`);
      }
    };
  }

  function save() {
    const answered = fdAllIds().filter(id => fdApplies(id, it, fd, insp.answers) && (insp.answers[id] || {}).v).length;
    if (!answered) { toast('Answer the checklist before saving'); return false; }
    const missingOther = fdAllIds().filter(id => (insp.answers[id] || {}).v === 'no' && ((fd.defects[id] || {}).type === 'Other') && !(fd.defects[id] || {}).note);
    if (missingOther.length) { toast('Describe the "Other" defect for: ' + FD_LABELS[missingOther[0]]); return false; }
    // drop defect / caveat records for answers that changed
    for (const id of Object.keys(fd.defects)) if ((insp.answers[id] || {}).v !== 'no') delete fd.defects[id];
    for (const id of Object.keys(fd.caveats)) if ((insp.answers[id] || {}).v !== 'caveat') delete fd.caveats[id];
    for (const [slot, pid] of Object.entries(fd.photoSlots)) {
      const [kind, ...rest] = slot.split('_'); const id = rest.join('_');
      const keep = kind === 'd' ? (insp.answers[id] || {}).v === 'no' : kind === 'c' ? (insp.answers[id] || {}).v === 'caveat' : kind === 'e' ? (insp.answers[id] || {}).v === 'yes' : true;
      if (!keep) { removed.push(pid); delete fd.photoSlots[slot]; }
    }
    fd.result = fdComputeResult(it, insp);
    insp.outcome = FD_RESULTS[fd.result] || 'fail';
    insp.photos = Object.values(fd.photoSlots);
    insp.readings = { gapHead: fd.gaps.top_left || '', gapHinge: fd.gaps.left_mid || '', gapLock: fd.gaps.right_mid || '', gapThreshold: fd.gaps.bottom_left || '' };
    if (!insp.action) {
      const f = fdFindings(it, insp);
      if (f.length) insp.action = `Put right: ${f.join('; ')}`;
    }
    // keep the door's register details in step with what was found
    it.details = Object.assign({}, it.details, {
      rating: fd.rating || (it.details || {}).rating,
      config: fd.config === 'Double Leaf' ? 'Double Leaf' : ((it.details || {}).config || 'Single Leaf'),
      certification: fd.classification === 'Certificated' ? ((it.details || {}).certification || 'Label') : fd.classification === 'Nominal' ? 'None Found' : (it.details || {}).certification,
      glazed: (insp.answers.has_glazing || {}).v === 'yes' ? 'Yes' : (insp.answers.has_glazing || {}).v === 'no' ? 'No' : (it.details || {}).glazed
    });
    Store.upsert('items', it);
    Store.upsert('inspections', Object.assign(existing || {}, insp));
    removed.filter(Boolean).forEach(p => Store.deletePhoto(p));
    invalidateState();
    toast(`${it.ref} — ${fd.result}`);
    return true;
  }

  render();
}

/* ---------- Printed inspection record (like the Knights Court FDI record) ---------- */
function fdGapDiagramSvg(fd, width = '80mm') {
  const val = id => fdHas((fd.gaps || {})[id]) ? Number(fd.gaps[id]) : null;
  const col = (id, v) => v === null ? '#9aa5b1' : fdGapOut(id, v, fd) ? '#c62828' : '#2e7d32';
  const dbl = fd.config === 'Double Leaf';
  const pts = [['top_left', 120, 30, 'above'], ['top_right', 200, 30, 'above'], ['left_top', 100, 90, 'left'], ['left_mid', 100, 180, 'left'], ['left_bottom', 100, 270, 'left'],
    ['right_top', 220, 90, 'right'], ['right_mid', 220, 180, 'right'], ['right_bottom', 220, 270, 'right'], ['bottom_left', 120, 330, 'below'], ['bottom_right', 200, 330, 'below']];
  if (dbl) pts.push(['meet_top', 160, 90, 'mid'], ['meet_mid', 160, 180, 'mid'], ['meet_bottom', 160, 270, 'mid']);
  const marks = pts.map(([id, x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${col(id, val(id))}" stroke="#fff" stroke-width="1.5"/>`).join('');
  const labels = pts.map(([id, x, y, p]) => {
    let lx = x, ly = y, a = 'middle';
    if (p === 'above') ly = y - 11; else if (p === 'below') ly = y + 22; else if (p === 'left') { lx = x - 11; a = 'end'; } else if (p === 'right') { lx = x + 11; a = 'start'; } else { ly = y + 18; }
    const v = val(id);
    return `<text x="${lx}" y="${ly}" text-anchor="${a}" font-size="13" font-weight="bold" fill="${col(id, v)}" dominant-baseline="middle">${v === null ? '—' : v + 'mm'}</text>`;
  }).join('');
  return `<svg viewBox="0 0 320 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${width};display:block;margin:0 auto">
    <rect x="100" y="30" width="120" height="300" rx="4" fill="#eef2f7" stroke="#172033" stroke-width="3"/>
    ${dbl ? '<line x1="160" y1="30" x2="160" y2="330" stroke="#172033" stroke-width="2"/>' : ''}
    <text x="160" y="17" text-anchor="middle" font-size="10" fill="#667085">HEAD</text>
    <text x="160" y="353" text-anchor="middle" font-size="10" fill="#667085">THRESHOLD</text>
    <text x="90" y="62" text-anchor="end" font-size="10" fill="#667085">Hinge side</text>
    <text x="230" y="62" text-anchor="start" font-size="10" fill="#667085">Latch side</text>${marks}${labels}</svg>`;
}

function fdAnswerCell(id, insp, it) {
  const fd = insp.fd || {};
  if (!fdApplies(id, it, fd, insp.answers || {})) return ['N/A', 'na'];
  const v = ((insp.answers || {})[id] || {}).v;
  if (FD_FACT.has(id)) return [v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Not answered', 'na'];
  return v === 'yes' ? ['Yes', 'ok'] : v === 'no' ? ['No', 'bad'] : v === 'caveat' ? ["Can't verify", 'warn'] : ['Not answered', 'na'];
}

async function fdRecordHtml(it, insp) {
  const fd = insp.fd || {};
  const s = Store.settings;
  const site = siteOf(it), client = site ? Store.get('clients', site.clientId) : null;
  const photo = async id => id ? await Store.getPhoto(id) : null;
  const groups = FD_REPORT_ORDER.map(g => ({ g, ids: fdAllIds().filter(id => FD_GROUP_OF[id] === g) })).filter(x => x.ids.length);
  const colors = { ok: '#2e7d32', bad: '#c62828', warn: '#b26a00', na: '#667085' };
  const rows = groups.map(({ g, ids }) => `<table><tr><th colspan="3">${esc(g)}</th></tr>${ids.map(id => {
    const [txt, cls] = fdAnswerCell(id, insp, it);
    const note = cls === 'bad' ? fdDefectText((fd.defects || {})[id]) : cls === 'warn' ? fdDefectText((fd.caveats || {})[id]) : '';
    return `<tr><td>${esc(FD_LABELS[id])}</td><td style="width:22mm;font-weight:700;color:${colors[cls]}">${esc(txt)}</td><td style="width:62mm">${esc(note)}</td></tr>`;
  }).join('')}</table>`).join('');
  const keys = fdGapKeysFor(fd);
  const anyGaps = keys.some(([id]) => fdHas((fd.gaps || {})[id]));
  const gapRows = keys.map(([id, label]) => { const v = (fd.gaps || {})[id]; const has = fdHas(v); return `<tr><td>${esc(label)}</td><td style="font-weight:700;color:${has ? (fdGapOut(id, v, fd) ? colors.bad : colors.ok) : colors.na}">${has ? esc(v) + ' mm' : 'Not measured'}</td></tr>`; }).join('');
  const caption = slot => slot === 'outside' ? 'Outside of the door' : slot === 'inside' ? 'Inside of the door' : slot === 'doorid' ? 'Door ID' :
    `${slot[0] === 'd' ? 'Defect' : slot[0] === 'c' ? 'Caveat' : 'Evidence'} — ${FD_LABELS[slot.slice(2)] || ''}`;
  const photos = [];
  for (const [slot, pid] of Object.entries(fd.photoSlots || {})) { const src = await photo(pid); if (src) photos.push(`<div style="width:56mm;break-inside:avoid"><img src="${src}" style="width:56mm;height:42mm;object-fit:cover;border:1px solid #ccd"><div class="small">${esc(caption(slot))}</div></div>`); }
  const resultColour = fd.result === 'Pass' ? '#2e7d32' : fd.result === 'Pass with caveats' ? '#b26a00' : '#c62828';
  return `<div class="page">
    <div class="spread" style="align-items:flex-start"><div>${s.logo ? `<img src="${s.logo}" style="max-height:16mm;max-width:50mm">` : `<b style="color:var(--navy)">${esc(s.businessName)}</b>`}
      <h1 style="margin-top:3mm">Fire Door Inspection Record</h1>${client && client.logo ? `<img src="${client.logo}" style="max-height:12mm;max-width:45mm">` : ''}</div>
      <table style="width:70mm"><tr><th>Door Ref</th><td>${esc(it.ref)}</td></tr><tr><th>Inspected</th><td>${esc(fmtDate(insp.date))}</td></tr><tr><th>Next Due</th><td>${esc(fmtDate(insp.nextDue))}</td></tr></table></div>
    <div style="border-left:2.5mm solid ${resultColour};background:#f6f7fa;padding:3mm 4mm;margin:3mm 0"><b style="font-size:13pt;color:${resultColour}">${esc(fd.result || OUTCOME_LABEL[insp.outcome])}</b></div>
    <h2>Door Details</h2>
    <table><tr><th style="width:45mm">Client</th><td>${esc(client ? client.name : '')}</td></tr><tr><th>Site</th><td>${esc(site ? site.name : '')}</td></tr>
      <tr><th>Door</th><td>${esc(itemTitle(it))}</td></tr><tr><th>Location</th><td>${esc(locationText(it, true))}</td></tr>
      <tr><th>Classification</th><td>${esc(fd.classification || 'Not recorded')}${fd.certNumber ? ` · certificate ${esc(fd.certNumber)}` : ''}</td></tr>
      <tr><th>Fire Rating</th><td>${esc(fd.rating || 'Not recorded')} · smoke control: ${esc(fd.smoke || 'not recorded')} · ${esc(fd.config || '')}</td></tr>
      <tr><th>Door Thickness</th><td>${fdHas(fd.thickness) ? esc(fd.thickness) + ' mm' : 'Not measured'}</td></tr>
      <tr><th>Lock / Latch Type</th><td>${esc(fd.lockType || 'Not recorded')}</td></tr></table>
    <h2>Inspection Details</h2>
    <table><tr><th style="width:45mm">Inspector</th><td>${esc(insp.inspector || '')}</td></tr><tr><th>Competence</th><td>${esc(fd.competence || '')}</td></tr>
      <tr><th>Type Of Inspection</th><td>${esc(fd.inspectionType || '')}</td></tr>${fd.prevDefects ? `<tr><th>Previous Defects</th><td>${esc(fd.prevDefects)}</td></tr>` : ''}</table>
    <h2>Checklist</h2>${rows}
    ${anyGaps ? `<h2>Gap Measurements</h2><div style="display:flex;gap:6mm;align-items:flex-start"><div style="width:70mm">${fdGapDiagramSvg(fd, '70mm')}</div><table style="flex:1">${gapRows}</table></div>
      <p class="small">2–4 mm at the head, jambs and meeting stiles; threshold up to ${fdGapTolerance('bottom_left', fd)[1]} mm.</p>` : ''}
    ${insp.notes || insp.action ? `<h2>Defects & Actions</h2>${insp.notes ? `<p><b>Notes:</b> ${esc(insp.notes)}</p>` : ''}${insp.action ? `<p><b>Recommended action:</b> ${esc(insp.action)}</p>` : ''}` : ''}
    ${photos.length ? `<h2>Photographs</h2><div style="display:flex;flex-wrap:wrap;gap:3mm">${photos.join('')}</div>` : ''}
    <table class="mt"><tr><th style="width:45mm">Inspector's Signature</th><td style="height:14mm"></td><th style="width:20mm">Date</th><td style="width:35mm"></td></tr></table>
  </div>`;
}

/* ---------- Plain-English client report for one door (like the Knights Court owner report) ---------- */
async function fdClientReportHtml(it, insp) {
  const fd = insp.fd || {};
  const s = Store.settings;
  const site = siteOf(it), client = site ? Store.get('clients', site.clientId) : null;
  const findings = fdFindings(it, insp), caveats = fdCaveats(it, insp);
  const text = {
    'Pass': ['#2e7d32', 'This door passed', 'Everything checked was in order. Nothing needs doing now beyond keeping the door shut and the seals and fittings as they are.'],
    'Pass with caveats': ['#b26a00', 'This door passed, with some things that could not be checked', 'Nothing was found wrong, but one or more items could not be fully checked. They are listed below so they can be looked at next time.'],
    'Remedial action required': ['#b26a00', 'This door needs some work', 'One or more items need putting right so the door will protect people properly in a fire. They are listed below with how soon each should be done.'],
    'Urgent action required': ['#c62828', 'This door needs urgent attention', 'At least one item is serious enough that it should be put right straight away. It is listed below.']
  }[fd.result] || ['#175cd3', fd.result || '', ''];
  const kind = fdDoorKind(it);
  const intro = kind === 'flat' ? 'This is the front door of a flat. It is relied on to hold back fire and smoke from the corridor and stairs, giving people time to stay put or leave.'
    : kind === 'cupboard' ? 'This is a service cupboard, riser or plant room door. It protects the equipment inside and stops a fire there spreading into the escape route.'
    : 'This door is on an escape route or protects one. It holds back fire and smoke so people can get out safely.';
  const tag = { ok: '✔ Good', bad: '✘ Needs attention', warn: '? Could not check', na: 'Not applicable' };
  const tagCol = { ok: '#2e7d32', bad: '#c62828', warn: '#b26a00', na: '#667085' };
  const groups = FD_REPORT_ORDER.map(g => ({ g, ids: fdAllIds().filter(id => FD_GROUP_OF[id] === g && fdApplies(id, it, fd, insp.answers || {})) })).filter(x => x.ids.length);
  const checks = groups.map(({ g, ids }) => `<h3>${esc(g)}</h3><p class="small" style="color:#475467">${esc(FD_GROUP_EXPLAIN[g] || '')}</p>
    <table>${ids.map(id => {
      const [, cls] = fdAnswerCell(id, insp, it);
      const fact = FD_FACT.has(id);
      const d = cls === 'bad' ? (fd.defects || {})[id] : cls === 'warn' ? (fd.caveats || {})[id] : null;
      const t = fact ? (((insp.answers || {})[id] || {}).v === 'yes' ? 'Yes' : 'No') : tag[cls];
      return `<tr><td><b>${esc(FD_LABELS[id])}</b><div class="small" style="color:#475467">${esc(FD_WHY[id] || '')}</div>${d && fdDefectText(d) ? `<div class="small"><b>${cls === 'warn' ? 'Why it could not be checked' : 'What was found'}:</b> ${esc(fdDefectText(d))}</div>` : ''}</td>
        <td style="width:34mm;font-weight:700;color:${fact ? tagCol.na : tagCol[cls]}">${esc(t)}</td></tr>`;
    }).join('')}</table>`).join('');
  const out = [];
  for (const [slot, pid] of Object.entries(fd.photoSlots || {})) { if (!['outside', 'inside'].includes(slot) && slot[0] !== 'd') continue; const src = await Store.getPhoto(pid); if (src) out.push(`<img src="${src}" style="width:56mm;height:42mm;object-fit:cover;border:1px solid #ccd">`); }
  return `<div class="page">
    <div style="background:var(--navy);color:#fff;padding:6mm 7mm;border-radius:4px"><div style="font-size:9pt;letter-spacing:.08em;color:#ffb48e;font-weight:700">${esc(s.businessName.toUpperCase())} · FIRE DOOR REPORT</div>
      ${client && client.logo ? `<img src="${client.logo}" style="float:right;max-height:16mm;max-width:45mm;background:#fff;padding:1.5mm;border-radius:3px">` : ''}<h1 style="color:#fff;margin:2mm 0 1mm">${esc(itemTitle(it))}</h1><div>${esc(client ? client.name + ' · ' : '')}${esc(site ? site.name : '')} · ${esc(locationText(it, true))}</div></div>
    <table class="mt"><tr><th style="width:40mm">Door Ref</th><td>${esc(it.ref)}</td><th style="width:30mm">Inspected</th><td>${esc(fmtDate(insp.date))}</td></tr>
      <tr><th>Inspected By</th><td>${esc(insp.inspector || '')}</td><th>Next Check</th><td>${esc(fmtDate(insp.nextDue))}</td></tr></table>
    <div style="border-left:2.5mm solid ${text[0]};background:#f6f7fa;padding:4mm 5mm;margin:4mm 0"><h2 style="margin:0 0 1mm;border:0;color:${text[0]}">${esc(text[1])}</h2><p style="margin:0">${esc(text[2])}</p></div>
    <p>${esc(intro)}</p>
    <p><b>Classification:</b> ${fd.classification === 'Certificated' ? `Certificated${fd.rating ? ` (${esc(fd.rating)})` : ''}${fd.certNumber ? `, certificate ${esc(fd.certNumber)}` : ''}. A label or plug was found, so the door’s rating is known.` : fd.classification === 'Nominal' ? `Nominal${fd.rating ? ` (${esc(fd.rating)} estimated)` : ''}. No label was found, so the rating is judged from the door’s construction${fdHas(fd.thickness) ? ` and thickness (${esc(fd.thickness)} mm)` : ''}.` : 'Not recorded.'}</p>
    ${findings.length ? `<h2>What Needs Doing</h2><table><tr><th>Item</th><th style="width:40mm">When</th></tr>${fdAllIds().filter(id => !FD_FACT.has(id) && fdApplies(id, it, fd, insp.answers || {}) && ((insp.answers || {})[id] || {}).v === 'no').map(id => {
      const d = (fd.defects || {})[id] || {}; const when = (FD_TIMESCALES.find(([v]) => v === d.timescale) || [])[1];
      return `<tr><td><b>${esc(FD_LABELS[id])}</b>${fdDefectText(d) ? `<div class="small">${esc(fdDefectText(d))}</div>` : ''}</td><td>${esc(when || 'To be agreed')}</td></tr>`; }).join('')}
      ${findings.filter(f => /^Gap|^Door thickness/.test(f)).map(f => `<tr><td><b>${esc(f)}</b></td><td>To be agreed</td></tr>`).join('')}</table>` : ''}
    ${caveats.length ? `<h2>Things That Could Not Be Checked</h2><ul>${caveats.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    <h2>What Was Checked</h2>${checks}
    ${keysHaveGaps(fd) ? `<h2>Gaps Around The Door</h2><div style="display:flex;gap:6mm;align-items:center"><div style="width:62mm">${fdGapDiagramSvg(fd, '62mm')}</div><p class="small">The gap between a fire door and its frame should be 2–4 mm so the seals can close it in a fire. The gap under the door should be no more than ${fdGapTolerance('bottom_left', fd)[1]} mm. Green measurements are within tolerance; red ones need adjusting.</p></div>` : ''}
    ${out.length ? `<h2>Photographs</h2><div style="display:flex;flex-wrap:wrap;gap:3mm">${out.join('')}</div>` : ''}
  </div>`;
}
function keysHaveGaps(fd) { return fdGapKeysFor(fd).some(([id]) => fdHas((fd.gaps || {})[id])); }

async function fdPrint(it, insp, kind) {
  const html = kind === 'client' ? await fdClientReportHtml(it, insp) : await fdRecordHtml(it, insp);
  showPrint(`<div class="report">${html}</div>`, { title: `${it.ref} - ${kind === 'client' ? 'Fire Door Report' : 'Fire Door Inspection Record'} ${insp.date}` });
}
