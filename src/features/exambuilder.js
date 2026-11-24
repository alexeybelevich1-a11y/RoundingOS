/**
 * RoundingOS — Physical Exam Quick-Builder
 * Click abnormal findings; the normal baseline for that system is cleared for you.
 * Nothing reaches the patient chart until "Insert into Physical Exam" is pressed.
 */

const ExamBuilder = (() => {
  'use strict';

  /* ======================================================================
     Schema
     chip: { id, text, kind: 'normal'|'abnormal'|'modifier', clears?: [ids],
             excl?: 'key' (one-of within the system), slot?: composer slot }
     A `clears` edge is applied in BOTH directions, so each conflict is
     declared once on the abnormal chip.
     ====================================================================== */
  const EXAM_SCHEMA = [
    {
      id: 'gen', title: 'General', noteLabel: 'General',
      defaults: ['gen_alert', 'gen_nad', 'gen_comf'],
      groups: [
        {
          label: 'Baseline', chips: [
            { id: 'gen_alert', text: 'alert and oriented ×3', kind: 'normal', excl: 'ms' },
            { id: 'gen_nad', text: 'in no acute distress', kind: 'normal', excl: 'distress' },
            { id: 'gen_comf', text: 'resting comfortably', kind: 'normal' }
          ]
        },
        {
          label: 'Appearance', chips: [
            { id: 'gen_ill', text: 'ill-appearing', kind: 'abnormal', clears: ['gen_nad', 'gen_comf'], excl: 'distress' },
            { id: 'gen_toxic', text: 'toxic-appearing', kind: 'abnormal', clears: ['gen_nad', 'gen_comf'], excl: 'distress' },
            { id: 'gen_mild', text: 'in mild distress', kind: 'abnormal', clears: ['gen_nad'], excl: 'distress' },
            { id: 'gen_resp', text: 'in respiratory distress', kind: 'abnormal', clears: ['gen_nad', 'gen_comf'], excl: 'distress' },
            { id: 'gen_uncomf', text: 'appears uncomfortable', kind: 'abnormal', clears: ['gen_comf'] },
            { id: 'gen_cach', text: 'cachectic', kind: 'abnormal' },
            { id: 'gen_frail', text: 'frail and deconditioned', kind: 'abnormal' },
            { id: 'gen_obese', text: 'obese', kind: 'modifier' },
            { id: 'gen_diaph', text: 'diaphoretic', kind: 'abnormal' }
          ]
        },
        {
          label: 'Mental status', chips: [
            { id: 'gen_leth', text: 'lethargic', kind: 'abnormal', clears: ['gen_alert'], excl: 'ms' },
            { id: 'gen_somn', text: 'somnolent but arousable', kind: 'abnormal', clears: ['gen_alert'], excl: 'ms' },
            { id: 'gen_obt', text: 'obtunded', kind: 'abnormal', clears: ['gen_alert'], excl: 'ms' },
            { id: 'gen_agit', text: 'agitated', kind: 'abnormal', clears: ['gen_comf'] }
          ]
        }
      ]
    },

    {
      id: 'heent', title: 'HEENT / Neck', noteLabel: 'HEENT/Neck',
      defaults: ['hee_nc', 'hee_mmm', 'hee_noicterus', 'hee_nojvd'],
      groups: [
        {
          label: 'Baseline', chips: [
            { id: 'hee_nc', text: 'normocephalic, atraumatic', kind: 'normal' },
            { id: 'hee_mmm', text: 'mucous membranes moist', kind: 'normal', excl: 'mm' },
            { id: 'hee_noicterus', text: 'no scleral icterus', kind: 'normal', excl: 'sclera' },
            { id: 'hee_nojvd', text: 'no JVD', kind: 'normal', excl: 'jvd' },
            { id: 'hee_trach', text: 'trachea midline', kind: 'normal' }
          ]
        },
        {
          label: 'Neck veins', chips: [
            { id: 'hee_flatjv', text: 'flat neck veins', kind: 'abnormal', clears: ['hee_nojvd'], excl: 'jvd' },
            { id: 'hee_jvd8', text: 'JVD to ~8 cm', kind: 'abnormal', clears: ['hee_nojvd'], excl: 'jvd' },
            { id: 'hee_jvd12', text: 'JVD to ~12 cm', kind: 'abnormal', clears: ['hee_nojvd'], excl: 'jvd' },
            { id: 'hee_jvdjaw', text: 'JVD to the angle of the jaw', kind: 'abnormal', clears: ['hee_nojvd'], excl: 'jvd' },
            { id: 'hee_hjr', text: 'positive hepatojugular reflux', kind: 'abnormal' },
            { id: 'hee_nuchal', text: 'nuchal rigidity', kind: 'abnormal', clears: ['hee_trach'] }
          ]
        },
        {
          label: 'Head & neck', chips: [
            { id: 'hee_dry', text: 'dry mucous membranes', kind: 'abnormal', clears: ['hee_mmm'], excl: 'mm' },
            { id: 'hee_ict', text: 'scleral icterus', kind: 'abnormal', clears: ['hee_noicterus'], excl: 'sclera' },
            { id: 'hee_pale', text: 'pale conjunctivae', kind: 'abnormal' },
            { id: 'hee_thrush', text: 'oral thrush', kind: 'abnormal' },
            { id: 'hee_dent', text: 'poor dentition', kind: 'abnormal' },
            { id: 'hee_lad', text: 'cervical lymphadenopathy', kind: 'abnormal' }
          ]
        }
      ]
    },

    {
      id: 'cv', title: 'Cardiovascular', noteLabel: 'CV',
      defaults: ['cv_rrr', 'cv_s1s2', 'cv_nomrg'],
      groups: [
        {
          label: 'Rate & rhythm', chips: [
            { id: 'cv_rrr', text: 'regular rate and rhythm', kind: 'normal', excl: 'rhythm' },
            { id: 'cv_tachy', text: 'tachycardic', kind: 'abnormal', clears: ['cv_rrr'], excl: 'rhythm' },
            { id: 'cv_brady', text: 'bradycardic', kind: 'abnormal', clears: ['cv_rrr'], excl: 'rhythm' },
            { id: 'cv_irreg', text: 'irregularly irregular', kind: 'abnormal', clears: ['cv_rrr'], excl: 'rhythm' },
            { id: 'cv_s1s2', text: 'normal S1/S2', kind: 'normal' }
          ]
        },
        {
          label: 'Murmur — grade', chips: [
            { id: 'cv_nomrg', text: 'no murmurs, rubs, or gallops', kind: 'normal' },
            { id: 'cv_g1', text: '1/6', kind: 'abnormal', clears: ['cv_nomrg'], excl: 'mgrade', slot: 'mgrade' },
            { id: 'cv_g2', text: '2/6', kind: 'abnormal', clears: ['cv_nomrg'], excl: 'mgrade', slot: 'mgrade' },
            { id: 'cv_g3', text: '3/6', kind: 'abnormal', clears: ['cv_nomrg'], excl: 'mgrade', slot: 'mgrade' },
            { id: 'cv_g4', text: '4/6', kind: 'abnormal', clears: ['cv_nomrg'], excl: 'mgrade', slot: 'mgrade' },
            { id: 'cv_g5', text: '5/6', kind: 'abnormal', clears: ['cv_nomrg'], excl: 'mgrade', slot: 'mgrade' },
            { id: 'cv_g6', text: '6/6', kind: 'abnormal', clears: ['cv_nomrg'], excl: 'mgrade', slot: 'mgrade' }
          ]
        },
        {
          label: 'Murmur — timing', chips: [
            { id: 'cv_sys', text: 'systolic', kind: 'modifier', clears: ['cv_nomrg'], excl: 'mtype', slot: 'mtype' },
            { id: 'cv_holo', text: 'holosystolic', kind: 'modifier', clears: ['cv_nomrg'], excl: 'mtype', slot: 'mtype' },
            { id: 'cv_cresc', text: 'crescendo-decrescendo systolic', kind: 'modifier', clears: ['cv_nomrg'], excl: 'mtype', slot: 'mtype' },
            { id: 'cv_dias', text: 'diastolic', kind: 'modifier', clears: ['cv_nomrg'], excl: 'mtype', slot: 'mtype' }
          ]
        },
        {
          label: 'Murmur — location', chips: [
            { id: 'cv_rusb', text: 'at the RUSB', kind: 'modifier', clears: ['cv_nomrg'], excl: 'mloc', slot: 'mloc' },
            { id: 'cv_lusb', text: 'at the LUSB', kind: 'modifier', clears: ['cv_nomrg'], excl: 'mloc', slot: 'mloc' },
            { id: 'cv_llsb', text: 'at the LLSB', kind: 'modifier', clears: ['cv_nomrg'], excl: 'mloc', slot: 'mloc' },
            { id: 'cv_apex', text: 'at the apex', kind: 'modifier', clears: ['cv_nomrg'], excl: 'mloc', slot: 'mloc' },
            { id: 'cv_rad', text: 'radiating to the carotids', kind: 'modifier', clears: ['cv_nomrg'], slot: 'mrad' }
          ]
        },
        {
          label: 'Other', chips: [
            { id: 'cv_s3', text: 'S3 gallop present', kind: 'abnormal', clears: ['cv_nomrg'] },
            { id: 'cv_s4', text: 'S4 present', kind: 'abnormal', clears: ['cv_nomrg'] },
            { id: 'cv_rub', text: 'pericardial friction rub', kind: 'abnormal', clears: ['cv_nomrg'] },
            { id: 'cv_pmi', text: 'displaced PMI', kind: 'abnormal' },
            { id: 'cv_muffled', text: 'muffled heart sounds', kind: 'abnormal', clears: ['cv_s1s2'] }
          ]
        }
      ]
    },

    {
      id: 'pulm', title: 'Pulmonary', noteLabel: 'Pulm',
      defaults: ['pul_ctab', 'pul_noadv', 'pul_wobn'],
      groups: [
        {
          label: 'Baseline', chips: [
            { id: 'pul_ctab', text: 'clear to auscultation bilaterally', kind: 'normal' },
            { id: 'pul_noadv', text: 'no wheezes, rales, or rhonchi', kind: 'normal' }
          ]
        },
        {
          label: 'Breath sounds', chips: [
            { id: 'pul_bibas', text: 'bibasilar crackles', kind: 'abnormal', clears: ['pul_ctab', 'pul_noadv'] },
            { id: 'pul_crackR', text: 'crackles at the right base', kind: 'abnormal', clears: ['pul_ctab', 'pul_noadv'] },
            { id: 'pul_crackL', text: 'crackles at the left base', kind: 'abnormal', clears: ['pul_ctab', 'pul_noadv'] },
            { id: 'pul_diffcrack', text: 'diffuse crackles', kind: 'abnormal', clears: ['pul_ctab', 'pul_noadv'] },
            { id: 'pul_expwh', text: 'expiratory wheezing', kind: 'abnormal', clears: ['pul_ctab', 'pul_noadv'] },
            { id: 'pul_diffwh', text: 'diffuse wheezing', kind: 'abnormal', clears: ['pul_ctab', 'pul_noadv'] },
            { id: 'pul_rhon', text: 'rhonchi', kind: 'abnormal', clears: ['pul_ctab', 'pul_noadv'] },
            { id: 'pul_dimR', text: 'diminished breath sounds at the right base', kind: 'abnormal', clears: ['pul_ctab'] },
            { id: 'pul_dimL', text: 'diminished breath sounds at the left base', kind: 'abnormal', clears: ['pul_ctab'] },
            { id: 'pul_dimB', text: 'diminished breath sounds bilaterally', kind: 'abnormal', clears: ['pul_ctab'] },
            { id: 'pul_ego', text: 'egophony', kind: 'abnormal', clears: ['pul_ctab'] },
            { id: 'pul_dull', text: 'dullness to percussion', kind: 'abnormal', clears: ['pul_ctab'] }
          ]
        },
        {
          label: 'Work of breathing', chips: [
            { id: 'pul_wobn', text: 'normal work of breathing', kind: 'normal', excl: 'wob' },
            { id: 'pul_wobmild', text: 'mildly increased work of breathing', kind: 'abnormal', clears: ['pul_wobn'], excl: 'wob' },
            { id: 'pul_wobmod', text: 'moderately increased work of breathing', kind: 'abnormal', clears: ['pul_wobn'], excl: 'wob' },
            { id: 'pul_access', text: 'using accessory muscles', kind: 'abnormal', clears: ['pul_wobn'] },
            { id: 'pul_tripod', text: 'tripoding', kind: 'abnormal', clears: ['pul_wobn'] },
            { id: 'pul_short', text: 'speaking in short sentences', kind: 'abnormal' },
            { id: 'pul_tachyp', text: 'tachypneic', kind: 'abnormal', clears: ['pul_wobn'] },
            { id: 'pul_kuss', text: 'deep Kussmaul respirations', kind: 'abnormal', clears: ['pul_wobn'] }
          ]
        }
      ]
    },

    {
      id: 'abd', title: 'Abdomen', noteLabel: 'Abd',
      defaults: ['abd_soft', 'abd_nt', 'abd_nd', 'abd_bsn', 'abd_nogr'],
      groups: [
        {
          label: 'Baseline', chips: [
            { id: 'abd_soft', text: 'soft', kind: 'normal' },
            { id: 'abd_nt', text: 'non-tender', kind: 'normal' },
            { id: 'abd_nd', text: 'non-distended', kind: 'normal', excl: 'dist' },
            { id: 'abd_bsn', text: 'normoactive bowel sounds', kind: 'normal', excl: 'bs' },
            { id: 'abd_nogr', text: 'no guarding or rebound', kind: 'normal' }
          ]
        },
        {
          label: 'Tenderness', chips: [
            { id: 'abd_ruq', text: 'RUQ tenderness', kind: 'abnormal', clears: ['abd_nt'] },
            { id: 'abd_luq', text: 'LUQ tenderness', kind: 'abnormal', clears: ['abd_nt'] },
            { id: 'abd_rlq', text: 'RLQ tenderness', kind: 'abnormal', clears: ['abd_nt'] },
            { id: 'abd_llq', text: 'LLQ tenderness', kind: 'abnormal', clears: ['abd_nt'] },
            { id: 'abd_epi', text: 'epigastric tenderness', kind: 'abnormal', clears: ['abd_nt'] },
            { id: 'abd_supra', text: 'suprapubic tenderness', kind: 'abnormal', clears: ['abd_nt'] },
            { id: 'abd_diff', text: 'diffuse tenderness', kind: 'abnormal', clears: ['abd_nt'] },
            { id: 'abd_cva', text: 'costovertebral angle tenderness', kind: 'abnormal', clears: ['abd_nt'] }
          ]
        },
        {
          label: 'Size / distension', chips: [
            { id: 'abd_mdist', text: 'mildly distended', kind: 'abnormal', clears: ['abd_nd'], excl: 'dist' },
            { id: 'abd_dist', text: 'distended', kind: 'abnormal', clears: ['abd_nd'], excl: 'dist' },
            { id: 'abd_tense', text: 'tensely distended with ascites', kind: 'abnormal', clears: ['abd_nd', 'abd_soft'], excl: 'dist' },
            { id: 'abd_fluid', text: 'fluid wave present', kind: 'abnormal', clears: ['abd_nd'] },
            { id: 'abd_shift', text: 'shifting dullness', kind: 'abnormal', clears: ['abd_nd'] },
            { id: 'abd_hep', text: 'hepatomegaly', kind: 'abnormal' },
            { id: 'abd_spl', text: 'splenomegaly', kind: 'abnormal' },
            { id: 'abd_caput', text: 'caput medusae', kind: 'abnormal' },
            { id: 'abd_tymp', text: 'tympanitic to percussion', kind: 'abnormal', clears: ['abd_nd'] }
          ]
        },
        {
          label: 'Bowel sounds', chips: [
            { id: 'abd_bshypo', text: 'hypoactive bowel sounds', kind: 'abnormal', clears: ['abd_bsn'], excl: 'bs' },
            { id: 'abd_bshyper', text: 'hyperactive bowel sounds', kind: 'abnormal', clears: ['abd_bsn'], excl: 'bs' },
            { id: 'abd_bsabs', text: 'absent bowel sounds', kind: 'abnormal', clears: ['abd_bsn'], excl: 'bs' }
          ]
        },
        {
          label: 'Peritoneal signs', chips: [
            { id: 'abd_vg', text: 'voluntary guarding', kind: 'abnormal', clears: ['abd_nogr'] },
            { id: 'abd_ig', text: 'involuntary guarding', kind: 'abnormal', clears: ['abd_nogr', 'abd_soft'] },
            { id: 'abd_reb', text: 'rebound tenderness', kind: 'abnormal', clears: ['abd_nogr'] },
            { id: 'abd_rigid', text: 'rigid', kind: 'abnormal', clears: ['abd_nogr', 'abd_soft'] },
            { id: 'abd_murphy', text: 'positive Murphy sign', kind: 'abnormal', clears: ['abd_nt'] }
          ]
        }
      ]
    },

    {
      id: 'ext', title: 'Extremities', noteLabel: 'Ext',
      defaults: ['ext_warm', 'ext_noedema', 'ext_pulses'],
      groups: [
        {
          label: 'Baseline', chips: [
            { id: 'ext_warm', text: 'warm and well-perfused', kind: 'normal', excl: 'perf' },
            { id: 'ext_noedema', text: 'no peripheral edema', kind: 'normal' },
            { id: 'ext_pulses', text: 'symmetric distal pulses', kind: 'normal', excl: 'pulse' }
          ]
        },
        {
          label: 'Edema — grade', chips: [
            { id: 'ext_trace', text: 'trace', kind: 'abnormal', clears: ['ext_noedema'], excl: 'egrade', slot: 'egrade' },
            { id: 'ext_1p', text: '1+', kind: 'abnormal', clears: ['ext_noedema'], excl: 'egrade', slot: 'egrade' },
            { id: 'ext_2p', text: '2+', kind: 'abnormal', clears: ['ext_noedema'], excl: 'egrade', slot: 'egrade' },
            { id: 'ext_3p', text: '3+', kind: 'abnormal', clears: ['ext_noedema'], excl: 'egrade', slot: 'egrade' },
            { id: 'ext_4p', text: '4+', kind: 'abnormal', clears: ['ext_noedema'], excl: 'egrade', slot: 'egrade' }
          ]
        },
        {
          label: 'Edema — side & extent', chips: [
            { id: 'ext_bilat', text: 'bilateral', kind: 'modifier', clears: ['ext_noedema'], excl: 'elat', slot: 'elat' },
            { id: 'ext_right', text: 'right lower extremity', kind: 'modifier', clears: ['ext_noedema'], excl: 'elat', slot: 'elat' },
            { id: 'ext_left', text: 'left lower extremity', kind: 'modifier', clears: ['ext_noedema'], excl: 'elat', slot: 'elat' },
            { id: 'ext_ankle', text: 'to the ankles', kind: 'modifier', clears: ['ext_noedema'], excl: 'eext', slot: 'eext' },
            { id: 'ext_shin', text: 'to mid-shin', kind: 'modifier', clears: ['ext_noedema'], excl: 'eext', slot: 'eext' },
            { id: 'ext_knee', text: 'to the knees', kind: 'modifier', clears: ['ext_noedema'], excl: 'eext', slot: 'eext' },
            { id: 'ext_thigh', text: 'to the thighs', kind: 'modifier', clears: ['ext_noedema'], excl: 'eext', slot: 'eext' },
            { id: 'ext_sacral', text: 'with sacral edema', kind: 'abnormal', clears: ['ext_noedema'] }
          ]
        },
        {
          label: 'Perfusion & pulses', chips: [
            { id: 'ext_cool', text: 'cool distal extremities', kind: 'abnormal', clears: ['ext_warm'], excl: 'perf' },
            { id: 'ext_mottled', text: 'mottled', kind: 'abnormal', clears: ['ext_warm'], excl: 'perf' },
            { id: 'ext_caprefill', text: 'delayed capillary refill', kind: 'abnormal', clears: ['ext_warm'] },
            { id: 'ext_dimpulse', text: 'diminished DP/PT pulses', kind: 'abnormal', clears: ['ext_pulses'], excl: 'pulse' },
            { id: 'ext_nopulse', text: 'non-palpable pedal pulses', kind: 'abnormal', clears: ['ext_pulses'], excl: 'pulse' },
            { id: 'ext_calf', text: 'calf tenderness', kind: 'abnormal' },
            { id: 'ext_asym', text: 'asymmetric calf swelling', kind: 'abnormal', clears: ['ext_noedema'] },
            { id: 'ext_club', text: 'digital clubbing', kind: 'abnormal' },
            { id: 'ext_cyan', text: 'peripheral cyanosis', kind: 'abnormal' }
          ]
        }
      ]
    },

    {
      id: 'neuro', title: 'Neurologic', noteLabel: 'Neuro',
      defaults: ['neu_alert', 'neu_cn', 'neu_moves', 'neu_nofocal'],
      groups: [
        {
          label: 'Baseline', chips: [
            { id: 'neu_alert', text: 'alert and following commands', kind: 'normal', excl: 'cmd' },
            { id: 'neu_cn', text: 'cranial nerves II–XII grossly intact', kind: 'normal' },
            { id: 'neu_moves', text: 'moves all extremities spontaneously', kind: 'normal' },
            { id: 'neu_nofocal', text: 'no focal deficit', kind: 'normal' }
          ]
        },
        {
          label: 'Mentation', chips: [
            { id: 'neu_disT', text: 'disoriented to time', kind: 'abnormal' },
            { id: 'neu_disPT', text: 'disoriented to place and time', kind: 'abnormal' },
            { id: 'neu_inatt', text: 'inattentive', kind: 'abnormal' },
            { id: 'neu_fluct', text: 'fluctuating attention', kind: 'abnormal' },
            { id: 'neu_nocmd', text: 'not following commands', kind: 'abnormal', clears: ['neu_alert'], excl: 'cmd' },
            { id: 'neu_asterix', text: 'asterixis present', kind: 'abnormal' },
            { id: 'neu_tremor', text: 'tremor', kind: 'abnormal' }
          ]
        },
        {
          label: 'Focal findings', chips: [
            { id: 'neu_dysarth', text: 'dysarthric speech', kind: 'abnormal', clears: ['neu_nofocal'] },
            { id: 'neu_aphas', text: 'expressive aphasia', kind: 'abnormal', clears: ['neu_nofocal'] },
            { id: 'neu_droop', text: 'facial droop', kind: 'abnormal', clears: ['neu_nofocal', 'neu_cn'] },
            { id: 'neu_weakL', text: 'left-sided weakness', kind: 'abnormal', clears: ['neu_nofocal', 'neu_moves'] },
            { id: 'neu_weakR', text: 'right-sided weakness', kind: 'abnormal', clears: ['neu_nofocal', 'neu_moves'] },
            { id: 'neu_gait', text: 'unsteady gait', kind: 'abnormal' },
            { id: 'neu_sens', text: 'decreased distal sensation', kind: 'abnormal', clears: ['neu_nofocal'] }
          ]
        }
      ]
    },

    {
      id: 'skin', title: 'Skin / Wounds / Lines', noteLabel: 'Skin',
      defaults: ['skn_warm', 'skn_norash', 'skn_nobreak'],
      groups: [
        {
          label: 'Baseline', chips: [
            { id: 'skn_warm', text: 'warm, dry, and intact', kind: 'normal' },
            { id: 'skn_norash', text: 'no rashes', kind: 'normal' },
            { id: 'skn_nobreak', text: 'no acute breakdown', kind: 'normal' }
          ]
        },
        {
          label: 'Skin', chips: [
            { id: 'skn_jaund', text: 'jaundiced', kind: 'abnormal' },
            { id: 'skn_pale', text: 'pale', kind: 'abnormal' },
            { id: 'skn_diaph', text: 'diaphoretic', kind: 'abnormal', clears: ['skn_warm'] },
            { id: 'skn_eryth', text: 'erythema', kind: 'abnormal', clears: ['skn_norash'] },
            { id: 'skn_cell', text: 'cellulitic changes', kind: 'abnormal', clears: ['skn_norash', 'skn_nobreak'] },
            { id: 'skn_stasis', text: 'venous stasis changes', kind: 'abnormal' },
            { id: 'skn_ecchy', text: 'scattered ecchymoses', kind: 'abnormal', clears: ['skn_warm'] },
            { id: 'skn_pet', text: 'petechiae', kind: 'abnormal', clears: ['skn_norash'] },
            { id: 'skn_turgor', text: 'poor skin turgor', kind: 'abnormal' },
            { id: 'skn_splinter', text: 'splinter hemorrhages', kind: 'abnormal' }
          ]
        },
        {
          label: 'Wounds', chips: [
            { id: 'skn_sacral', text: 'sacral pressure injury', kind: 'abnormal', clears: ['skn_nobreak'] },
            { id: 'skn_st2', text: 'stage 2', kind: 'modifier', clears: ['skn_nobreak'], excl: 'stage' },
            { id: 'skn_st3', text: 'stage 3', kind: 'modifier', clears: ['skn_nobreak'], excl: 'stage' },
            { id: 'skn_st4', text: 'stage 4', kind: 'modifier', clears: ['skn_nobreak'], excl: 'stage' },
            { id: 'skn_unstage', text: 'unstageable', kind: 'modifier', clears: ['skn_nobreak'], excl: 'stage' },
            { id: 'skn_ulcer', text: 'lower extremity ulcer', kind: 'abnormal', clears: ['skn_nobreak'] },
            { id: 'skn_incision', text: 'surgical incision clean, dry, intact', kind: 'normal' }
          ]
        },
        {
          label: 'Lines & drains', chips: [
            { id: 'skn_piv', text: 'PIV sites clean and dry', kind: 'normal' },
            { id: 'skn_midline', text: 'midline in place', kind: 'modifier' },
            { id: 'skn_picc', text: 'PICC in place, site clean and dry', kind: 'modifier' },
            { id: 'skn_cvc', text: 'central line in place, site clean and dry', kind: 'modifier' },
            { id: 'skn_foley', text: 'Foley catheter in place', kind: 'modifier' },
            { id: 'skn_telemetry', text: 'on telemetry', kind: 'modifier' }
          ]
        }
      ]
    }
  ];

  /* ======================================================================
     Presets — applied as clicks on top of the normal baseline, so the same
     auto-exclusion rules run and no contradictory pair can survive.
     ====================================================================== */
  const PRESETS = [
    { id: 'normal', cat: 'General', label: 'All normal', keys: 'normal unremarkable baseline wnl', picks: {} },

    /* ---- Cardiac ---- */
    {
      id: 'adhf', cat: 'Cardiac', label: 'ADHF / volume overload',
      keys: 'chf heart failure hfref hfpef fluid overload decompensated edema',
      picks: {
        gen: ['gen_mild'], heent: ['hee_jvdjaw', 'hee_hjr'],
        cv: ['cv_tachy', 'cv_s3'], pulm: ['pul_bibas', 'pul_wobmild'],
        ext: ['ext_bilat', 'ext_2p', 'ext_knee']
      }
    },
    {
      id: 'acs', cat: 'Cardiac', label: 'ACS / NSTEMI',
      keys: 'chest pain mi myocardial infarction troponin unstable angina acute coronary',
      picks: { gen: ['gen_uncomf', 'gen_diaph'], cv: ['cv_tachy'], skin: ['skn_diaph'] }
    },
    {
      id: 'afib', cat: 'Cardiac', label: 'Atrial fibrillation with RVR',
      keys: 'afib a-fib rvr irregular tachycardia arrhythmia rate control',
      picks: { gen: ['gen_mild'], cv: ['cv_irreg', 'cv_tachy'] }
    },
    {
      id: 'endocarditis', cat: 'Cardiac', label: 'Infective endocarditis',
      keys: 'endocarditis ie valve vegetation bacteremia murmur janeway osler',
      picks: {
        gen: ['gen_ill'], cv: ['cv_tachy', 'cv_g3', 'cv_holo', 'cv_apex'],
        skin: ['skn_splinter', 'skn_pet']
      }
    },

    /* ---- Pulmonary ---- */
    {
      id: 'copd', cat: 'Pulmonary', label: 'COPD exacerbation',
      keys: 'copd emphysema chronic bronchitis aecopd wheezing',
      picks: {
        gen: ['gen_resp'], cv: ['cv_tachy'],
        pulm: ['pul_diffwh', 'pul_expwh', 'pul_dimB', 'pul_wobmod', 'pul_access', 'pul_short', 'pul_tachyp']
      }
    },
    {
      id: 'asthma', cat: 'Pulmonary', label: 'Asthma exacerbation',
      keys: 'asthma reactive airway bronchospasm wheeze status asthmaticus',
      picks: {
        gen: ['gen_resp'], cv: ['cv_tachy'],
        pulm: ['pul_diffwh', 'pul_expwh', 'pul_wobmod', 'pul_access', 'pul_short', 'pul_tachyp']
      }
    },
    {
      id: 'pna', cat: 'Pulmonary', label: 'Pneumonia (CAP)',
      keys: 'pneumonia cap consolidation infiltrate lrti chest infection',
      picks: {
        gen: ['gen_ill'], cv: ['cv_tachy'],
        pulm: ['pul_crackR', 'pul_ego', 'pul_dull', 'pul_wobmild', 'pul_tachyp']
      }
    },
    {
      id: 'aspiration', cat: 'Pulmonary', label: 'Aspiration pneumonia',
      keys: 'aspiration aspirate dysphagia hap pneumonitis',
      picks: {
        gen: ['gen_ill', 'gen_leth'], cv: ['cv_tachy'],
        pulm: ['pul_crackR', 'pul_rhon', 'pul_wobmild', 'pul_tachyp'],
        neuro: ['neu_disT']
      }
    },
    {
      id: 'pe', cat: 'Pulmonary', label: 'Pulmonary embolism',
      keys: 'pe pulmonary embolism dvt clot hypoxia pleuritic',
      picks: {
        gen: ['gen_mild'], cv: ['cv_tachy'], pulm: ['pul_tachyp', 'pul_wobmild'],
        ext: ['ext_left', 'ext_asym', 'ext_calf']
      }
    },
    {
      id: 'effusion', cat: 'Pulmonary', label: 'Pleural effusion',
      keys: 'effusion pleural thoracentesis dullness',
      picks: { pulm: ['pul_dimR', 'pul_dull', 'pul_wobmild'] }
    },

    /* ---- GI / Liver ---- */
    {
      id: 'cirrhosis', cat: 'GI / Liver', label: 'Cirrhosis / ascites',
      keys: 'cirrhosis ascites liver esld portal hypertension paracentesis sbp',
      picks: {
        heent: ['hee_ict'], abd: ['abd_tense', 'abd_shift', 'abd_fluid', 'abd_spl', 'abd_caput'],
        ext: ['ext_bilat', 'ext_2p', 'ext_shin'], neuro: ['neu_asterix'],
        skin: ['skn_jaund', 'skn_ecchy']
      }
    },
    {
      id: 'he', cat: 'GI / Liver', label: 'Hepatic encephalopathy',
      keys: 'he hepatic encephalopathy ammonia lactulose confusion liver',
      picks: {
        gen: ['gen_leth'], heent: ['hee_ict'],
        abd: ['abd_dist'], neuro: ['neu_asterix', 'neu_disPT', 'neu_inatt'],
        skin: ['skn_jaund']
      }
    },
    {
      id: 'ugib', cat: 'GI / Liver', label: 'Upper GI bleed',
      keys: 'gi bleed ugib melena hematemesis anemia egd ulcer varices',
      picks: {
        gen: ['gen_ill'], heent: ['hee_pale'], cv: ['cv_tachy'],
        abd: ['abd_epi'], skin: ['skn_pale']
      }
    },
    {
      id: 'pancreatitis', cat: 'GI / Liver', label: 'Pancreatitis',
      keys: 'pancreatitis lipase gallstone epigastric alcohol',
      picks: {
        gen: ['gen_uncomf'], cv: ['cv_tachy'],
        abd: ['abd_epi', 'abd_vg', 'abd_bshypo', 'abd_mdist']
      }
    },
    {
      id: 'sbo', cat: 'GI / Liver', label: 'SBO / ileus',
      keys: 'sbo bowel obstruction ileus distension ng tube obstipation',
      picks: {
        gen: ['gen_uncomf'],
        abd: ['abd_dist', 'abd_tymp', 'abd_diff', 'abd_bshyper']
      }
    },
    {
      id: 'chole', cat: 'GI / Liver', label: 'Cholecystitis / biliary',
      keys: 'cholecystitis gallbladder biliary murphy cholangitis ruq',
      picks: {
        gen: ['gen_ill'], heent: ['hee_ict'], cv: ['cv_tachy'],
        abd: ['abd_ruq', 'abd_murphy', 'abd_vg'], skin: ['skn_jaund']
      }
    },

    /* ---- Infectious ---- */
    {
      id: 'sepsis', cat: 'Infectious', label: 'Sepsis / septic shock',
      keys: 'sepsis septic shock bacteremia infection pressors lactate',
      picks: {
        gen: ['gen_toxic', 'gen_leth'], heent: ['hee_dry'], cv: ['cv_tachy'],
        pulm: ['pul_tachyp'], ext: ['ext_cool', 'ext_mottled', 'ext_caprefill'],
        neuro: ['neu_inatt'], skin: ['skn_diaph']
      }
    },
    {
      id: 'uti', cat: 'Infectious', label: 'UTI / pyelonephritis',
      keys: 'uti pyelonephritis urinary urosepsis dysuria cva foley',
      picks: { gen: ['gen_ill'], cv: ['cv_tachy'], abd: ['abd_supra', 'abd_cva'] }
    },
    {
      id: 'cellulitis', cat: 'Infectious', label: 'Cellulitis',
      keys: 'cellulitis skin soft tissue ssti erysipelas leg redness',
      picks: {
        gen: ['gen_mild'],
        ext: ['ext_left', 'ext_calf'], skin: ['skn_eryth', 'skn_cell']
      }
    },
    {
      id: 'dfi', cat: 'Infectious', label: 'Diabetic foot infection',
      keys: 'diabetic foot ulcer osteomyelitis wound podiatry neuropathy',
      picks: {
        ext: ['ext_dimpulse'], neuro: ['neu_sens'],
        skin: ['skn_ulcer', 'skn_eryth']
      }
    },
    {
      id: 'meningitis', cat: 'Infectious', label: 'Meningitis',
      keys: 'meningitis nuchal rigidity lp csf headache photophobia',
      picks: {
        gen: ['gen_ill', 'gen_leth'], heent: ['hee_nuchal'], cv: ['cv_tachy'],
        neuro: ['neu_disPT', 'neu_inatt']
      }
    },

    /* ---- Neurologic ---- */
    {
      id: 'delirium', cat: 'Neurologic', label: 'Delirium / encephalopathy',
      keys: 'delirium ams altered mental status confusion encephalopathy sundowning',
      picks: {
        gen: ['gen_leth', 'gen_agit'],
        neuro: ['neu_disPT', 'neu_inatt', 'neu_fluct', 'neu_asterix']
      }
    },
    {
      id: 'cva', cat: 'Neurologic', label: 'Acute stroke / CVA',
      keys: 'stroke cva tia hemiparesis nihss tpa thrombectomy facial droop',
      picks: {
        gen: ['gen_alert'],
        neuro: ['neu_droop', 'neu_weakR', 'neu_dysarth', 'neu_aphas']
      }
    },
    {
      id: 'etoh', cat: 'Neurologic', label: 'Alcohol withdrawal',
      keys: 'alcohol withdrawal etoh ciwa dts tremor benzodiazepine',
      picks: {
        gen: ['gen_agit', 'gen_diaph'], cv: ['cv_tachy'],
        neuro: ['neu_tremor', 'neu_disT', 'neu_inatt'], skin: ['skn_diaph']
      }
    },
    {
      id: 'seizure', cat: 'Neurologic', label: 'Seizure / post-ictal',
      keys: 'seizure postictal epilepsy convulsion aed status',
      picks: {
        gen: ['gen_somn'],
        neuro: ['neu_disPT', 'neu_nocmd', 'neu_inatt'], heent: ['hee_dent']
      }
    },

    /* ---- Renal / Endocrine / Heme ---- */
    {
      id: 'aki', cat: 'Renal / Endo', label: 'AKI / hypovolemia',
      keys: 'aki acute kidney injury prerenal dehydration hypovolemia creatinine',
      picks: {
        heent: ['hee_dry', 'hee_flatjv'], cv: ['cv_tachy'],
        skin: ['skn_turgor']
      }
    },
    {
      id: 'dka', cat: 'Renal / Endo', label: 'DKA / HHS',
      keys: 'dka hhs diabetic ketoacidosis hyperglycemia insulin drip anion gap',
      picks: {
        gen: ['gen_ill'], heent: ['hee_dry'], cv: ['cv_tachy'],
        pulm: ['pul_kuss', 'pul_tachyp'], skin: ['skn_turgor']
      }
    },
    {
      id: 'anemia', cat: 'Renal / Endo', label: 'Symptomatic anemia',
      keys: 'anemia hemoglobin transfusion pallor fatigue',
      picks: {
        gen: ['gen_frail'], heent: ['hee_pale'], cv: ['cv_tachy', 'cv_g2', 'cv_sys'],
        skin: ['skn_pale']
      }
    },

    /* ---- Other ---- */
    {
      id: 'comfort', cat: 'Other', label: 'Comfort care / end of life',
      keys: 'comfort care hospice palliative eol terminal dying goals of care',
      picks: {
        gen: ['gen_cach', 'gen_somn', 'gen_comf'],
        cv: ['cv_tachy'], pulm: ['pul_rhon', 'pul_dimB'],
        neuro: ['neu_nocmd'], ext: ['ext_cool', 'ext_mottled']
      }
    },
    {
      id: 'wound', cat: 'Other', label: 'Pressure injury / wound',
      keys: 'pressure ulcer wound decubitus sacral stage debridement skin breakdown',
      picks: {
        gen: ['gen_frail'],
        skin: ['skn_sacral', 'skn_st3', 'skn_eryth']
      }
    }
  ];

  /* ====================== indexes built once ====================== */
  const CHIP = {};          // id -> chip
  const CHIP_SYS = {};      // id -> system id
  const CONFLICT = {};      // id -> Set of ids cleared when this is selected

  (function buildIndexes() {
    EXAM_SCHEMA.forEach(sys => {
      sys.groups.forEach(g => g.chips.forEach(c => {
        CHIP[c.id] = c;
        CHIP_SYS[c.id] = sys.id;
        CONFLICT[c.id] = CONFLICT[c.id] || new Set();
      }));
    });
    const link = (a, b) => {
      if (a === b || !CONFLICT[a] || !CONFLICT[b]) return;
      CONFLICT[a].add(b);
      CONFLICT[b].add(a);   // declared once, enforced both ways
    };
    EXAM_SCHEMA.forEach(sys => {
      const byExcl = {};
      sys.groups.forEach(g => g.chips.forEach(c => {
        (c.clears || []).forEach(other => link(c.id, other));
        if (c.excl) (byExcl[c.excl] = byExcl[c.excl] || []).push(c.id);
      }));
      Object.values(byExcl).forEach(ids => {
        ids.forEach(a => ids.forEach(b => link(a, b)));
      });
    });
  })();

  /* ====================== state ====================== */
  let hooks = null;
  let selected = {};
  let perSystemManual = {};
  let globalManual = '';
  let outputFormat = 'multiline';
  let manualOutputEdited = false;
  let wired = false;
  let presetQuery = '';
  let presetCursor = 0;
  let appliedPresetId = 'normal';

  const $id = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function makeDefaults() {
    const out = {};
    EXAM_SCHEMA.forEach(s => { out[s.id] = [...s.defaults]; });
    return out;
  }
  function makeEmpty() {
    const out = {};
    EXAM_SCHEMA.forEach(s => { out[s.id] = []; });
    return out;
  }

  function isOn(sysId, chipId) { return (selected[sysId] || []).includes(chipId); }

  function setChip(sysId, chipId, on) {
    const cur = new Set(selected[sysId] || []);
    if (on) {
      cur.add(chipId);
      CONFLICT[chipId].forEach(other => { if (CHIP_SYS[other] === sysId) cur.delete(other); });
    } else {
      cur.delete(chipId);
    }
    const order = [];
    EXAM_SCHEMA.find(s => s.id === sysId).groups.forEach(g => g.chips.forEach(c => { if (cur.has(c.id)) order.push(c.id); }));
    selected[sysId] = order;
  }

  function toggleChip(sysId, chipId) { setChip(sysId, chipId, !isOn(sysId, chipId)); }

  function applyPreset(preset) {
    selected = makeDefaults();
    Object.entries(preset.picks || {}).forEach(([sysId, ids]) => {
      ids.forEach(id => setChip(sysId, id, true));
    });
  }

  /* ====================== composers ======================
     Murmurs and edema read as nonsense when their parts are comma-joined,
     so those slots are assembled into one phrase. */
  function composeMurmur(ids) {
    const pick = slot => ids.find(id => CHIP[id].slot === slot);
    const grade = pick('mgrade'), type = pick('mtype'), loc = pick('mloc'), rad = pick('mrad');
    if (!grade && !type && !loc && !rad) return null;
    const parts = [];
    if (grade) parts.push(`grade ${CHIP[grade].text}`);
    if (type) parts.push(CHIP[type].text);
    parts.push('murmur');
    if (loc) parts.push(CHIP[loc].text);
    if (rad) parts.push(CHIP[rad].text);
    return { text: parts.join(' '), consumed: [grade, type, loc, rad].filter(Boolean) };
  }

  function composeEdema(ids) {
    const pick = slot => ids.find(id => CHIP[id].slot === slot);
    const grade = pick('egrade'), lat = pick('elat'), ext = pick('eext');
    if (!grade && !lat && !ext) return null;
    const parts = [];
    if (lat) parts.push(CHIP[lat].text);
    if (grade) parts.push(CHIP[grade].text);
    parts.push(grade && CHIP[grade].text !== 'trace' ? 'pitting edema' : 'edema');
    if (ext) parts.push(CHIP[ext].text);
    return { text: parts.join(' '), consumed: [grade, lat, ext].filter(Boolean) };
  }

  const COMPOSERS = { cv: composeMurmur, ext: composeEdema };

  function formatSystemLine(sys) {
    const curIds = selected[sys.id] || [];
    const composer = COMPOSERS[sys.id];
    const composed = composer ? composer(curIds) : null;
    const consumed = new Set(composed ? composed.consumed : []);

    const ordered = [];
    let placed = false;
    sys.groups.flatMap(g => g.chips).forEach(c => {
      if (!curIds.includes(c.id)) return;
      if (consumed.has(c.id)) {
        if (!placed) { ordered.push(composed.text); placed = true; }
        return;
      }
      ordered.push(c.text);
    });
    if (composed && !placed) ordered.push(composed.text);

    const manual = (perSystemManual[sys.id] || '').trim();
    if (manual) ordered.push(manual);
    if (!ordered.length) return '';

    let s = ordered.join(', ');
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/[.!?]$/.test(s)) s += '.';
    return `${sys.noteLabel}: ${s}`;
  }

  function buildExamText() {
    const lines = EXAM_SCHEMA.map(formatSystemLine).filter(Boolean);
    if (globalManual.trim()) lines.push(`Additional findings: ${globalManual.trim()}`);
    return outputFormat === 'compact' ? lines.join(' ') : lines.join('\n');
  }

  function countAbnormal() {
    let n = 0;
    EXAM_SCHEMA.forEach(sys => (selected[sys.id] || []).forEach(id => {
      if (CHIP[id].kind === 'abnormal') n++;
    }));
    return n;
  }

  function systemHasAbnormal(sys) {
    return (selected[sys.id] || []).some(id => CHIP[id].kind === 'abnormal') || !!(perSystemManual[sys.id] || '').trim();
  }

  /* ====================== render ====================== */
  function renderSystems() {
    const host = $id('peSystemsGrid');
    if (!host) return;
    host.innerHTML = EXAM_SCHEMA.map(sys => `
      <div class="pe-sys-card${systemHasAbnormal(sys) ? ' has-abnormal' : ''}" data-pe-sys="${sys.id}">
        <div class="pe-sys-head">
          <div class="pe-sys-title">${esc(sys.title)}</div>
          <button type="button" class="link-btn" data-pe-sysreset="${sys.id}">normal</button>
        </div>
        ${sys.groups.map(g => `
          <div>
            <div class="pe-chip-group-lbl">${esc(g.label)}</div>
            <div class="pe-chips">
              ${g.chips.map(c => `
                <button type="button"
                  class="pe-chip kind-${c.kind}${isOn(sys.id, c.id) ? ' active' : ''}"
                  data-pe-chip="${c.id}" data-pe-chipsys="${sys.id}"
                  aria-pressed="${isOn(sys.id, c.id) ? 'true' : 'false'}">${esc(c.text)}</button>
              `).join('')}
            </div>
          </div>
        `).join('')}
        <input type="text" class="pe-manual-input" data-pe-manual="${sys.id}"
          placeholder="Add to ${esc(sys.noteLabel)} line…" value="${esc(perSystemManual[sys.id] || '')}">
      </div>
    `).join('');
  }

  /* ---- preset search ---- */
  function presetMatches(p, q) {
    if (!q) return true;
    const hay = (p.label + ' ' + p.cat + ' ' + (p.keys || '')).toLowerCase();
    return q.split(/\s+/).filter(Boolean).every(term => hay.includes(term));
  }

  function filteredPresets() {
    const q = presetQuery.trim().toLowerCase();
    return PRESETS.filter(p => presetMatches(p, q));
  }

  function renderPresetBar() {
    const bar = $id('pePresetsBar');
    if (!bar) return;
    bar.innerHTML = `
      <div class="pe-search-wrap">
        <input type="text" id="pePresetSearch" class="pe-search-input" autocomplete="off" spellcheck="false"
          placeholder="Search presets — chf, copd, sepsis, gi bleed…" aria-label="Search exam presets"
          aria-expanded="false" aria-controls="pePresetPanel" role="combobox">
        <div class="pe-preset-panel hidden" id="pePresetPanel" role="listbox"></div>
      </div>
      <span class="pe-applied" id="peAppliedLabel"></span>
      <button type="button" class="link-btn" id="pePresetBrowseBtn">Browse all ${PRESETS.length}</button>`;
  }

  function renderPresetResults() {
    const panel = $id('pePresetPanel');
    if (!panel) return;
    const list = filteredPresets();
    if (!list.length) {
      panel.innerHTML = `<div class="pe-preset-empty">No preset matches “${esc(presetQuery)}” — build it by hand, or use a close one and edit.</div>`;
      presetCursor = -1;
      return;
    }
    if (presetCursor >= list.length) presetCursor = list.length - 1;
    let html = '', lastCat = null, i = 0;
    list.forEach(p => {
      if (p.cat !== lastCat) { html += `<div class="pe-preset-group">${esc(p.cat)}</div>`; lastCat = p.cat; }
      html += `<button type="button" class="pe-preset-item${i === presetCursor ? ' sel' : ''}"
        data-pe-preset="${p.id}" role="option" aria-selected="${i === presetCursor}" data-idx="${i}">${esc(p.label)}</button>`;
      i++;
    });
    panel.innerHTML = html;
    const sel = panel.querySelector('.pe-preset-item.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function openPresetPanel(show) {
    const panel = $id('pePresetPanel');
    const input = $id('pePresetSearch');
    if (!panel) return;
    panel.classList.toggle('hidden', !show);
    if (input) input.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (show) renderPresetResults();
  }

  function renderAppliedLabel() {
    const el = $id('peAppliedLabel');
    if (!el) return;
    const p = PRESETS.find(x => x.id === appliedPresetId);
    el.textContent = p && p.id !== 'normal' ? `Applied: ${p.label}` : '';
  }

  function choosePreset(id) {
    const preset = PRESETS.find(p => p.id === id);
    if (!preset) return;
    applyPreset(preset);
    perSystemManual = {};
    globalManual = '';
    const gm = $id('peGlobalManual');
    if (gm) gm.value = '';
    appliedPresetId = preset.id;
    manualOutputEdited = false;
    presetQuery = '';
    const input = $id('pePresetSearch');
    if (input) input.value = '';
    openPresetPanel(false);
    renderAll();
    renderAppliedLabel();
    if (hooks.showToast) hooks.showToast(`${preset.label} — review every line before inserting`);
  }

  function renderOutput() {
    const ta = $id('peOutputText');
    if (!ta) return;
    if (!manualOutputEdited) ta.value = buildExamText();
    const hint = $id('peAbnormalCount');
    if (hint) {
      const n = countAbnormal();
      hint.textContent = n ? `${n} abnormal finding${n === 1 ? '' : 's'}` : 'all normal';
      hint.classList.toggle('pe-count-abn', n > 0);
    }
    const warn = $id('peEditedWarn');
    if (warn) warn.classList.toggle('hidden', !manualOutputEdited);
  }

  function renderAll() { renderSystems(); renderOutput(); }

  /* ====================== open / close ====================== */
  function open() {
    if (!$id('examBuilderModal')) return;
    selected = makeDefaults();
    perSystemManual = {};
    globalManual = '';
    manualOutputEdited = false;
    outputFormat = 'multiline';

    const gm = $id('peGlobalManual'); if (gm) gm.value = '';
    document.querySelectorAll('#peFormatTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.fmt === 'multiline'));

    const p = hooks && hooks.getActivePatient ? hooks.getActivePatient() : null;
    const hint = $id('peModalPatientHint');
    if (hint) {
      hint.textContent = p
        ? `Writing for Rm ${p.room} · ${p.name} — nothing is saved until you insert`
        : 'No patient selected — you can still build and copy';
    }
    const applyBtn = $id('peApplyToPatientBtn');
    if (applyBtn) applyBtn.disabled = !p;

    presetQuery = '';
    presetCursor = 0;
    appliedPresetId = 'normal';
    renderPresetBar();
    renderAppliedLabel();
    renderAll();
    $id('examBuilderModal').classList.remove('hidden');
  }

  function close() {
    const m = $id('examBuilderModal');
    if (m) m.classList.add('hidden');
  }

  /* ====================== wiring ====================== */
  function init(config) {
    hooks = config || {};
    if (wired) return;
    const modal = $id('examBuilderModal');
    if (!modal) return;
    wired = true;

    modal.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.dataset.peChip) {
        toggleChip(btn.dataset.peChipsys, btn.dataset.peChip);
        manualOutputEdited = false;
        appliedPresetId = null;
        renderAppliedLabel();
        renderAll();
        return;
      }
      if (btn.dataset.peSysreset) {
        const sys = EXAM_SCHEMA.find(s => s.id === btn.dataset.peSysreset);
        selected[sys.id] = [...sys.defaults];
        perSystemManual[sys.id] = '';
        manualOutputEdited = false;
        renderAll();
        return;
      }
      if (btn.dataset.pePreset) {
        choosePreset(btn.dataset.pePreset);
        return;
      }
      if (btn.id === 'pePresetBrowseBtn') {
        presetQuery = '';
        presetCursor = 0;
        const si = $id('pePresetSearch');
        if (si) { si.value = ''; si.focus(); }
        openPresetPanel(true);
        return;
      }
      if (btn.dataset.fmt) {
        outputFormat = btn.dataset.fmt;
        document.querySelectorAll('#peFormatTabs .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
        manualOutputEdited = false;
        renderOutput();
      }
    });

    modal.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset && t.dataset.peManual) {
        perSystemManual[t.dataset.peManual] = t.value;
        manualOutputEdited = false;
        renderOutput();
        const card = t.closest('.pe-sys-card');
        if (card) card.classList.toggle('has-abnormal', systemHasAbnormal(EXAM_SCHEMA.find(s => s.id === t.dataset.peManual)));
        return;
      }
      if (t.id === 'peGlobalManual') {
        globalManual = t.value;
        manualOutputEdited = false;
        renderOutput();
        return;
      }
      if (t.id === 'pePresetSearch') {
        presetQuery = t.value;
        presetCursor = 0;
        openPresetPanel(true);
        return;
      }
      if (t.id === 'peOutputText') {
        manualOutputEdited = true;
        const warn = $id('peEditedWarn');
        if (warn) warn.classList.remove('hidden');
      }
    });

    // Both resets also clear the free-text boxes: leaving stale manual text behind
    // after "All normal" would quietly contradict the exam it just built.
    function resetTo(makeFn) {
      selected = makeFn();
      perSystemManual = {};
      globalManual = '';
      const gm = $id('peGlobalManual');
      if (gm) gm.value = '';
      manualOutputEdited = false;
      appliedPresetId = makeFn === makeDefaults ? 'normal' : null;
      renderAppliedLabel();
      renderAll();
    }

    $id('peResetAllNormBtn')?.addEventListener('click', () => resetTo(makeDefaults));
    $id('peClearAllBtn')?.addEventListener('click', () => resetTo(makeEmpty));

    $id('peCopyBtn')?.addEventListener('click', () => {
      const ta = $id('peOutputText');
      if (!ta || !ta.value.trim()) return;
      const done = ok => hooks.showToast && hooks.showToast(ok ? 'Exam copied' : 'Press Ctrl+C — the text is selected', ok ? 'info' : 'error');
      // navigator.clipboard is unavailable on file://, which is how this app runs
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(ta.value).then(() => done(true), () => { ta.focus(); ta.select(); done(document.execCommand('copy')); });
      } else {
        ta.focus(); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        done(ok);
      }
    });

    modal.addEventListener('keydown', e => {
      if (e.target.id !== 'pePresetSearch') return;
      const list = filteredPresets();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!list.length) return;
        openPresetPanel(true);
        presetCursor = Math.max(0, Math.min(list.length - 1, presetCursor + (e.key === 'ArrowDown' ? 1 : -1)));
        renderPresetResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = list[presetCursor] || list[0];
        if (pick) choosePreset(pick.id);
      } else if (e.key === 'Escape') {
        // Close the dropdown only. Without stopPropagation this would also reach
        // the modal's Escape handler and discard the whole exam.
        const panelOpen = !$id('pePresetPanel')?.classList.contains('hidden');
        if (panelOpen) {
          e.preventDefault();
          e.stopPropagation();
          openPresetPanel(false);
          e.target.blur();
        }
      }
    });

    modal.addEventListener('focusin', e => {
      if (e.target.id === 'pePresetSearch') openPresetPanel(true);
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.pe-search-wrap') && !e.target.closest('#pePresetBrowseBtn')) openPresetPanel(false);
    });

    $id('peApplyToPatientBtn')?.addEventListener('click', () => {
      const ta = $id('peOutputText');
      const text = (ta ? ta.value : '').trim();
      if (!text) {
        if (hooks.showToast) hooks.showToast('Nothing to insert', 'error');
        return;
      }
      if (hooks.onApply) hooks.onApply(text);
      close();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });
  }

  return { init, open, close, buildExamText, EXAM_SCHEMA, PRESETS };
})();
