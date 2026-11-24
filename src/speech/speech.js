/**
 * Hospitalist Workflow Tracker — Web Speech Recognition Engine
 * Supports both hands-free clinical voice commands and field-level dictation.
 */

const SpeechEngine = (() => {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  let recognition = null;
  let activeMode = null; // 'command' | 'dictation' | null
  let activeFieldEl = null;
  let activeButtonEl = null;
  let continuousCommand = false;
  let callbacks = {
    onStatusChange: () => {},
    onInterim: () => {},
    onCommandResult: () => {},
    onError: () => {}
  };

  function isSupported() {
    return Boolean(SpeechRec);
  }

  function init(opts = {}) {
    callbacks = { ...callbacks, ...opts };
  }

  /* Voice is off until the user turns it on and sees that audio goes to the
     browser's cloud speech service (Google/Apple/Microsoft). */
  let voiceEnabled = false;
  function setEnabled(on) {
    voiceEnabled = Boolean(on);
    if (!voiceEnabled && activeMode) stop();
  }
  function voiceAllowed() {
    if (voiceEnabled) return true;
    if (typeof callbacks.onConsentNeeded === 'function') callbacks.onConsentNeeded();
    return false;
  }

  const MEDICAL_PHONETIC_FIXES = [
    // Commonly misheard inpatient diagnoses, syndromes & microbiology
    [/\b(euro|your oh|you row)\s*sepsis\b/gi, 'urosepsis'],
    [/\bhigh\s*po\s*na\s*tre?mia\b|\bhigh pole tree mia\b|\bhyponatria\b/gi, 'hyponatremia'],
    [/\bhigh\s*per\s*na\s*tre?mia\b/gi, 'hypernatremia'],
    [/\bhigh\s*per\s*ka\s*le?mia\b|\bhyper kalemia\b/gi, 'hyperkalemia'],
    [/\bhigh\s*po\s*ka\s*le?mia\b|\bhypo kalemia\b/gi, 'hypokalemia'],
    [/\bhigh\s*per\s*cal\s*ce?mia\b/gi, 'hypercalcemia'],
    [/\bhigh\s*po\s*cal\s*ce?mia\b/gi, 'hypocalcemia'],
    [/\bhigh\s*po\s*mag\s*ne\s*semia\b/gi, 'hypomagnesemia'],
    [/\bhigh\s*po\s*phos\s*pha\s*temia\b/gi, 'hypophosphatemia'],
    [/\bluke\s*oh\s*cy\s*to\s*sis\b|\blucas cytosis\b/gi, 'leukocytosis'],
    [/\bluke\s*oh\s*penia\b/gi, 'leukopenia'],
    [/\bthrombo\s*cyto\s*penia\b/gi, 'thrombocytopenia'],
    [/\bthrombo\s*cyto\s*sis\b/gi, 'thrombocytosis'],
    [/\bpan\s*cyto\s*penia\b/gi, 'pancytopenia'],
    [/\bneutro\s*penia\b|\bnew tro penia\b/gi, 'neutropenia'],
    [/\bmelinda\b(?=\s+(?:stool|bleed|gi|ugib|hgb|hemoglobin|overnight|and|or))/gi, 'melena'],
    [/\bhemato\s*chezia\b|\bhema to keys ya\b/gi, 'hematochezia'],
    [/\bhema\s*temesis\b|\bhemat emesis\b/gi, 'hematemesis'],
    [/\bhema\s*turia\b|\bhema to ria\b/gi, 'hematuria'],
    [/\bdis\s*pnea\b|\bdisp near\b/gi, 'dyspnea'],
    [/\bortho\s*pnea\b/gi, 'orthopnea'],
    [/\btacky\s*cardia\b|\btachy cardia\b/gi, 'tachycardia'],
    [/\btacky\s*pnea\b|\btachy pnea\b/gi, 'tachypnea'],
    [/\bbrady\s*cardia\b/gi, 'bradycardia'],
    [/\ba[\s-]?fib\b|\baesthetic fib\b|\b8 fib\b|\ba fib\b/gi, 'AFib'],
    [/\ba[\s-]?fib\s+with\s+r\s*v\s*r\b/gi, 'AFib with RVR'],
    [/\ba[\s-]?flutter\b|\batrial flatter\b/gi, 'atrial flutter'],
    [/\bn[\s-]?stemi\b|\ben stemmy\b|\bin stemmy\b|\bend stemmy\b/gi, 'NSTEMI'],
    [/\bstemmy\b/gi, 'STEMI'],
    [/\bs\s*v\s*t\b/gi, 'SVT'],
    [/\bv[\s-]?tach\b|\bvee tack\b/gi, 'VTach'],
    [/\bh\s*f\s*ref\b|\bhef ref\b|\bhf ref\b|\bhave ref\b/gi, 'HFrEF'],
    [/\bh\s*f\s*pef\b|\bhef pef\b|\bhf pef\b|\bhave pef\b/gi, 'HFpEF'],
    [/\ba\s*d\s*h\s*f\b/gi, 'ADHF'],
    [/\bc\s*h\s*f\b/gi, 'CHF'],
    [/\bc\s*a\s*d\b/gi, 'CAD'],
    [/\bc\s*o\s*p\s*d\b/gi, 'COPD'],
    [/\bo\s*s\s*a\b/gi, 'OSA'],
    [/\bi\s*l\s*d\b/gi, 'ILD'],
    [/\ba\s*r\s*d\s*s\b/gi, 'ARDS'],
    [/\bd\s*k\s*a\b/gi, 'DKA'],
    [/\bh\s*h\s*s\b/gi, 'HHS'],
    [/\ba\s*k\s*i\b/gi, 'AKI'],
    [/\bc\s*k\s*d\b/gi, 'CKD'],
    [/\be\s*s\s*r\s*d\b/gi, 'ESRD'],
    [/\bu\s*t\s*i\b/gi, 'UTI'],
    [/\bs\s*b\s*p\b/gi, 'SBP'],
    [/\bs\s*b\s*o\b/gi, 'SBO'],
    [/\bu\s*g\s*i\s*b\b/gi, 'UGIB'],
    [/\bl\s*g\s*i\s*b\b/gi, 'LGIB'],
    [/\bg\s*e\s*r\s*d\b/gi, 'GERD'],
    [/\bp\s*u\s*d\b/gi, 'PUD'],
    [/\bi\s*c\s*h\b/gi, 'ICH'],
    [/\bs\s*d\s*h\b/gi, 'SDH'],
    [/\bs\s*a\s*h\b/gi, 'SAH'],
    [/\bt\s*i\s*a\b/gi, 'TIA'],
    [/\bc\s*v\s*a\b/gi, 'CVA'],
    [/\bd\s*v\s*t\b/gi, 'DVT'],
    [/\bv\s*t\s*e\b/gi, 'VTE'],
    [/\bd\s*i\s*c\b/gi, 'DIC'],
    [/\bs\s*i\s*a\s*d\s*h\b/gi, 'SIADH'],
    [/\bc\s*i\s*w\s*a\b|\bsee wa\b|\bsea wa\b/gi, 'CIWA'],
    [/\bb\s*p\s*h\b/gi, 'BPH'],
    [/\bpie\s*low\s*nephritis\b|\bpile oh nephritis\b/gi, 'pyelonephritis'],
    [/\bnew\s*monya\b|\bnew\s*monia\b/gi, 'pneumonia'],
    [/\bnew\s*mo\s*thorax\b|\bpneumo thorax\b/gi, 'pneumothorax'],
    [/\bnew\s*mo\s*nitis\b/gi, 'pneumonitis'],
    [/\bplural\s+effusion\b|\bpleural\s+infusion\b/gi, 'pleural effusion'],
    [/\bemp\s*eye\s*ema\b|\bempy\s*ema\b/gi, 'empyema'],
    [/\bbronchi\s*ectasis\b/gi, 'bronchiectasis'],
    [/\bcell\s*you\s*litis\b|\bsell you litis\b/gi, 'cellulitis'],
    [/\bback\s*ter\s*emia\b/gi, 'bacteremia'],
    [/\bfung\s*emia\b/gi, 'fungemia'],
    [/\bendo\s*carditis\b/gi, 'endocarditis'],
    [/\bperi\s*carditis\b/gi, 'pericarditis'],
    [/\bmyo\s*carditis\b/gi, 'myocarditis'],
    [/\bmen\s*in\s*gitis\b/gi, 'meningitis'],
    [/\bcoal\s*an\s*gitis\b|\bcholan\s*gitis\b/gi, 'cholangitis'],
    [/\bchole\s*cystitis\b|\bcoal e cystitis\b/gi, 'cholecystitis'],
    [/\bpan\s*crea\s*titis\b/gi, 'pancreatitis'],
    [/\bdiver\s*ticulitis\b/gi, 'diverticulitis'],
    [/\bappen\s*dicitis\b/gi, 'appendicitis'],
    [/\bperi\s*tonitis\b/gi, 'peritonitis'],
    [/\bsir\s*oh\s*sis\b|\bzero sis\b/gi, 'cirrhosis'],
    [/\ba\s*side\s*ease\b|\bass\s*sight\s*ease\b|\ba\s*sights\b/gi, 'ascites'],
    [/\bvery\s*seas\b|\bvar\s*ices\b/gi, 'varices'],
    [/\beye\s*lee\s*us\b|\bill\s*e\s*us\b/gi, 'ileus'],
    [/\bgastro\s*paresis\b/gi, 'gastroparesis'],
    [/\bhydro\s*nephrosis\b/gi, 'hydronephrosis'],
    [/\bnephro\s*lithiasis\b/gi, 'nephrolithiasis'],
    [/\bglom\s*erulo\s*nephritis\b/gi, 'glomerulonephritis'],
    [/\brhabdo\s*myolysis\b|\brabdo\b/gi, 'rhabdomyolysis'],
    [/\bc\s*diff\b|\bsea diff\b|\bsee diff\b/gi, 'C. diff'],
    [/\bmer\s*sa\b|\bmarissa\b(?=\s+(?:nares|pneumonia|coverage|positive|negative|abscess|cellulitis|bacteremia))/gi, 'MRSA'],
    [/\bm\s*s\s*s\s*a\b/gi, 'MSSA'],
    [/\bv\s*r\s*e\b/gi, 'VRE'],
    [/\be\s*s\s*b\s*l\b/gi, 'ESBL'],
    [/\bsue\s*do\s*monas\b|\bpseudo\s*monas\b/gi, 'Pseudomonas'],
    [/\bkleb\s*siella\b/gi, 'Klebsiella'],
    [/\bstrep\s*to\s*coccus\b/gi, 'Streptococcus'],
    [/\bstaph\s+aureus\b|\bstaff\s+aureus\b/gi, 'Staph aureus'],
    [/\bpara\s*centesis\b/gi, 'paracentesis'],
    [/\bthora\s*centesis\b/gi, 'thoracentesis'],
    [/\bsin\s*co\s*pee\b|\bsync copy\b/gi, 'syncope'],
    [/\bosteo\s*myelitis\b/gi, 'osteomyelitis'],
    [/\bencephalo\s*pathy\b/gi, 'encephalopathy'],
    [/\bhemo\s*ptysis\b/gi, 'hemoptysis'],
    [/\bdis\s*phagia\b/gi, 'dysphagia'],
    [/\bhemo\s*lysis\b/gi, 'hemolysis'],
    [/\bcoag\s*ulo\s*pathy\b/gi, 'coagulopathy'],
    [/\bvascu\s*litis\b/gi, 'vasculitis'],
    [/\bpseudo\s*gout\b/gi, 'pseudogout'],
    [/\bmyx\s*edema\b/gi, 'myxedema'],
    [/\bthyro\s*toxicosis\b/gi, 'thyrotoxicosis'],
    [/\bmya\s*sthenia\b/gi, 'myasthenia'],
    [/\bdecubitus\b|\bde\s*cubitus\b/gi, 'decubitus'],

    // Commonly misheard hospitalist antibiotics & antivirals
    [/\b(ceph\s*a\s*peem|ceph\s*a\s*beam|sepia\s*meme|seph\s*a\s*beam|cef\s*a\s*pime|cefepeme|cephapime)\b/gi, 'cefepime'],
    [/\b(ceph\s*try\s*axon|sef\s*try\s*axon|cef\s*tri\s*axone|ceftriaxon|rocephin)\b/gi, 'ceftriaxone'],
    [/\b(ceph\s*a\s*zolin|sef\s*a\s*zolin|ancef)\b/gi, 'cefazolin'],
    [/\b(ceph\s*a\s*lexin|keflex)\b/gi, 'cephalexin'],
    [/\b(cef\s*dinir|omnicef)\b/gi, 'cefdinir'],
    [/\b(cef\s*podoxime)\b/gi, 'cefpodoxime'],
    [/\b(pipe\s*a\s*ceiling|pip\s*tazo|pip[\s-]?tazo|zo\s*sin|zosyn)\b/gi, 'piperacillin-tazobactam'],
    [/\b(amp\s*sulbactam|una\s*sin|unasyn)\b/gi, 'ampicillin-sulbactam'],
    [/\b(amox\s*clav|aug\s*mentin|augmentin)\b/gi, 'amoxicillin-clavulanate'],
    [/\b(vanko\s*mycin|banco\s*mycin|vanco)\b/gi, 'vancomycin'],
    [/\b(dapto\s*mycin|dapto)\b/gi, 'daptomycin'],
    [/\b(line\s*zolid|zyvox)\b/gi, 'linezolid'],
    [/\b(clinda\s*mycin|clinda)\b/gi, 'clindamycin'],
    [/\b(mero\s*penem|mirror\s*penem|merrem)\b/gi, 'meropenem'],
    [/\b(erta\s*penem|invanz)\b/gi, 'ertapenem'],
    [/\b(metro\s*nidazole|flagyl)\b/gi, 'metronidazole'],
    [/\b(a\s*zithro\s*mycin|z[\s-]?pack)\b/gi, 'azithromycin'],
    [/\b(doxy\s*cycline|doxy)\b/gi, 'doxycycline'],
    [/\b(levo\s*floxacin|levaquin)\b/gi, 'levofloxacin'],
    [/\b(cipro\s*floxacin|cipro)\b/gi, 'ciprofloxacin'],
    [/\b(bactrim|tmp[\s-]?smx|trimethoprim\s+sulfa)\b/gi, 'TMP-SMX'],
    [/\b(nitro\s*furantoin|macrobid)\b/gi, 'nitrofurantoin'],
    [/\b(fidaxo\s*micin|dificid)\b/gi, 'fidaxomicin'],
    [/\b(mica\s*fungin)\b/gi, 'micafungin'],
    [/\b(flu\s*conazole|diflucan)\b/gi, 'fluconazole'],
    [/\b(a\s*cyclovir)\b/gi, 'acyclovir'],
    [/\b(osel\s*tamivir|tamiflu)\b/gi, 'oseltamivir'],

    // Cardiac, renal, pressors, anticoagulants & diuretics
    [/\b(for\s*oh\s*semide|furo\s*semide|lay\s*six|lasix)\b/gi, 'furosemide'],
    [/\b(bumex|bume\s*tanide)\b/gi, 'bumetanide'],
    [/\b(tor\s*semide)\b/gi, 'torsemide'],
    [/\b(meta\s*lo\s*zone|meto\s*lazone)\b/gi, 'metolazone'],
    [/\b(aceta\s*zolamide|diamox)\b/gi, 'acetazolamide'],
    [/\b(spiro\s*no\s*lactone)\b/gi, 'spironolactone'],
    [/\b(hydro\s*chloro\s*thiazide|h\s*c\s*t\s*z)\b/gi, 'HCTZ'],
    [/\b(chlor\s*thalidone)\b/gi, 'chlorthalidone'],
    [/\b(met\s*top\s*row\s*lol|meto\s*prolol|lopressor|toprol)\b/gi, 'metoprolol'],
    [/\b(car\s*vedilol|coreg)\b/gi, 'carvedilol'],
    [/\b(la\s*beta\s*lol|labetolol)\b/gi, 'labetalol'],
    [/\b(ni\s*cardi\s*pine|cardene)\b/gi, 'nicardipine'],
    [/\b(amlo\s*dipine|norvasc)\b/gi, 'amlodipine'],
    [/\b(hydra\s*lazine)\b/gi, 'hydralazine'],
    [/\b(dil\s*tia\s*zem|cardizem)\b/gi, 'diltiazem'],
    [/\b(amio\s*darone|amio)\b/gi, 'amiodarone'],
    [/\bdi\s*goxin\b|\bdig\b(?=\s+(?:level|toxicity|\d))/gi, 'digoxin'],
    [/\b(lisino\s*pril)\b/gi, 'lisinopril'],
    [/\b(lo\s*sartan)\b/gi, 'losartan'],
    [/\b(entresto|sacubitril\s+valsartan)\b/gi, 'sacubitril-valsartan'],
    [/\b(jardiance|empa\s*gliflozin)\b/gi, 'empagliflozin'],
    [/\b(farxiga|dapa\s*gliflozin)\b/gi, 'dapagliflozin'],
    [/\b(atorva\s*statin|lipitor)\b/gi, 'atorvastatin'],
    [/\b(rosuva\s*statin|crestor)\b/gi, 'rosuvastatin'],
    [/\b(a\s*pix\s*a\s*ban|eliquis|eli\s*quis)\b/gi, 'apixaban'],
    [/\b(riva\s*roxaban|xarelto)\b/gi, 'rivaroxaban'],
    [/\b(coumadin|war\s*farin)\b/gi, 'warfarin'],
    [/\b(in\s*ox\s*a\s*parent|enoxa\s*parin|love\s*knox|lovenox)\b/gi, 'enoxaparin'],
    [/\b(clopid\s*o\s*grel|plavix)\b/gi, 'clopidogrel'],
    [/\b(tica\s*grelor|brilinta)\b/gi, 'ticagrelor'],
    [/\b(tenecte\s*plase|t\s*n\s*k)\b/gi, 'tenecteplase'],
    [/\b(alte\s*plase|t\s*p\s*a)\b/gi, 'alteplase'],
    [/\b(levophed|nor\s*epinephrine)\b/gi, 'norepinephrine'],
    [/\b(vaso\s*pressin)\b/gi, 'vasopressin'],
    [/\b(phenyl\s*ephrine|neo\s*synephrine)\b/gi, 'phenylephrine'],
    [/\b(mido\s*drine)\b/gi, 'midodrine'],
    [/\b(fludro\s*cortisone)\b/gi, 'fludrocortisone'],
    [/\b(hydro\s*cortisone)\b/gi, 'hydrocortisone'],
    [/\b(solu[\s-]?medrol|methyl\s*prednisolone)\b/gi, 'methylprednisolone'],
    [/\b(dexa\s*methasone|decadron)\b/gi, 'dexamethasone'],

    // GI, endocrine, neuro, psych, resp & pain meds
    [/\b(panto\s*prazole|protonix)\b/gi, 'pantoprazole'],
    [/\b(famo\s*tidine|pepcid)\b/gi, 'famotidine'],
    [/\b(octreo\s*tide)\b/gi, 'octreotide'],
    [/\b(ondan\s*setron|zofran)\b/gi, 'ondansetron'],
    [/\b(meto\s*clopramide|reglan)\b/gi, 'metoclopramide'],
    [/\b(lactu\s*lose)\b/gi, 'lactulose'],
    [/\b(mira\s*lax|polyethylene\s+glycol)\b/gi, 'PEG (MiraLAX)'],
    [/\b(ri\s*faximin|xifaxan)\b/gi, 'rifaximin'],
    [/\b(halo\s*peridol|haldol)\b/gi, 'haloperidol'],
    [/\b(que\s*tiapine|seroquel)\b/gi, 'quetiapine'],
    [/\b(olan\s*zapine|zyprexa)\b/gi, 'olanzapine'],
    [/\b(lora\s*zepam|ativan)\b/gi, 'lorazepam'],
    [/\b(diaze\s*pam|valium)\b/gi, 'diazepam'],
    [/\b(pheno\s*barbital)\b/gi, 'phenobarbital'],
    [/\b(leve\s*tiracetam|keppra)\b/gi, 'levetiracetam'],
    [/\b(gaba\s*pentin)\b/gi, 'gabapentin'],
    [/\b(hydro\s*morphone|dilaudid)\b/gi, 'hydromorphone'],
    [/\b(aceta\s*minophen|tylenol)\b/gi, 'acetaminophen'],
    [/\b(keto\s*rolac|toradol)\b/gi, 'ketorolac'],
    [/\b(glar\s*gine|lantus)\b/gi, 'glargine'],
    [/\b(lis\s*pro|humalog)\b/gi, 'lispro'],
    [/\bnovolog\b|\bas\s*part\b(?=\s+(?:insulin|\d|units?|sliding|correction))/gi, 'aspart'],
    [/\b(duo\s*neb|duo\s*nebs)\b/gi, 'DuoNeb'],
    [/\b(al\s*buterol)\b/gi, 'albuterol'],
    [/\b(ipra\s*tropium)\b/gi, 'ipratropium'],
    [/\b(tiotropium|spiriva)\b/gi, 'tiotropium'],
    [/\b(tam\s*sulosin|flomax)\b/gi, 'tamsulosin'],
    [/\b(lo\s*kelma)\b/gi, 'SZC (Lokelma)'],
    [/\b(col\s*chicine)\b/gi, 'colchicine'],
    [/\b(allo\s*purinol)\b/gi, 'allopurinol'],
    [/\b(bupre\s*norphine|suboxone)\b/gi, 'buprenorphine'],
    [/\b(nal\s*trexone)\b/gi, 'naltrexone'],
    [/\b(thy\s*a\s*mine|thiamin)\b/gi, 'thiamine'],

    // Labs, imaging, respiratory, units & exam shorthand
    [/\bcreatine\b(?=\s+(?:\d|is|of|up|down|from|bumped|trending|normal|elevated|baseline))/gi, 'creatinine'],
    [/\bhigh\s+sensitivity\s+troponin\b/gi, 'hs-troponin'],
    [/\b(true\s*ponen|tro\s*ponin)\b/gi, 'troponin'],
    [/\b(pro\s*calcitonin|procal)\b/gi, 'procalcitonin'],
    [/\b(lack\s*date|lack\s*tate)\b/gi, 'lactate'],
    [/\b(buy\s*pap|bi\s*pap)\b/gi, 'BiPAP'],
    [/\b(see\s*pap|c\s*pap)\b/gi, 'CPAP'],
    [/\b(high\s*flow\s*nasal\s*cannula|h\s*f\s*n\s*c)\b/gi, 'HFNC'],
    [/\b(nasal\s*cannula)\b/gi, 'NC'],
    [/\b(non[\s-]?rebreather)\b/gi, 'NRB'],
    [/\b(room\s*air)\b/gi, 'RA'],
    [/\b(n\s*p\s*o)\b/gi, 'NPO'],
    [/\b(d\s*n\s*r\s*d\s*n\s*i|d\s*n\s*r\s+and\s+d\s*n\s*i)\b/gi, 'DNR/DNI'],
    [/\b(b\s*m\s*p)\b/gi, 'BMP'],
    [/\b(c\s*m\s*p)\b/gi, 'CMP'],
    [/\b(c\s*b\s*c)\b/gi, 'CBC'],
    [/\b(w\s*b\s*c)\b/gi, 'WBC'],
    [/\b(h\s*g\s*b|hemoglobin)\b/gi, 'Hgb'],
    [/\b(h\s*c\s*t|hematocrit)\b/gi, 'Hct'],
    [/\b(platelets?)\s+(?=\d)/gi, 'Plt '],
    [/\b(b\s*u\s*n)\b/gi, 'BUN'],
    [/\b(e\s*g\s*f\s*r)\b/gi, 'eGFR'],
    [/\b(i\s*n\s*r)\b/gi, 'INR'],
    [/\b(p\s*t\s*t)\b/gi, 'PTT'],
    [/\b(a\s*s\s*t)\b/gi, 'AST'],
    [/\b(a\s*l\s*t)\b/gi, 'ALT'],
    [/\b(alk\s*phos|alkaline\s+phosphatase)\b/gi, 'Alk Phos'],
    [/\b(total\s+bili(?:rubin)?)\b/gi, 'Tbili'],
    [/\b(h\s*b\s*a\s*1\s*c|a\s*1\s*c)\b/gi, 'A1c'],
    [/\b(c\s*r\s*p)\b/gi, 'CRP'],
    [/\b(e\s*s\s*r)\b/gi, 'ESR'],
    [/\b(t\s*s\s*h)\b/gi, 'TSH'],
    [/\b(l\s*d\s*h)\b/gi, 'LDH'],
    [/\b(b\s*h\s*b|beta[\s-]?hydroxybutyrate)\b/gi, 'BHB'],
    [/\b(v\s*b\s*g)\b/gi, 'VBG'],
    [/\b(a\s*b\s*g)\b/gi, 'ABG'],
    [/\b(b\s*n\s*p)\b/gi, 'BNP'],
    [/\b(c\s*x\s*r|chest\s*x[\s-]?ray)\b/gi, 'CXR'],
    [/\b(c\s*t\s*p\s*a)\b/gi, 'CTPA'],
    [/\b(c\s*t\s*a)\b/gi, 'CTA'],
    [/\b(k\s*u\s*b)\b/gi, 'KUB'],
    [/\b(t\s*t\s*e)\b/gi, 'TTE'],
    [/\b(t\s*e\s*e)\b/gi, 'TEE'],
    [/\b(e\s*k\s*g|e\s*c\s*g)\b/gi, 'ECG'],
    [/\b(e\s*g\s*d)\b/gi, 'EGD'],
    [/\b(e\s*r\s*c\s*p)\b/gi, 'ERCP'],
    [/\b(p\s*o\s*c\s*u\s*s)\b/gi, 'POCUS'],
    [/\b(p\s*i\s*c\s*c\s*line|pick\s*line)\b/gi, 'PICC line'],
    [/\b(alert\s+(?:and\s+)?oriented\s+(?:times|x)\s*4)\b/gi, 'A&Ox4'],
    [/\b(alert\s+(?:and\s+)?oriented\s+(?:times|x)\s*3)\b/gi, 'A&Ox3'],
    [/\b(no\s+acute\s+distress)\b/gi, 'NAD'],
    [/\b(normal\s+sinus\s+rhythm)\b/gi, 'NSR'],
    [/\b(c\s*t\s*a\s*b|clear\s+to\s+auscultation\s+bilaterally)\b/gi, 'CTAB'],
    [/\b(r\s*r\s*r|regular\s+rate\s+and\s+rhythm)\b/gi, 'RRR'],
    [/\b(n\s*t\s*n\s*d|non[\s-]?tender\s+non[\s-]?distended)\b/gi, 'NT/ND'],
    [/\b(costovertebral\s+angle\s+tenderness)\b/gi, 'CVA tenderness'],
    [/\b(work\s+of\s+breathing)\b/gi, 'WOB'],
    [/\b(head\s+of\s+bed)\b/gi, 'HOB'],
    [/\b(j\s*v\s*p)\b/gi, 'JVP'],
    [/\b(j\s*v\s*d|jugular\s+venous\s+distension)\b/gi, 'JVD'],
    [/\b(u\s*o\s*p)\b/gi, 'UOP'],
    [/\b(p\s*v\s*r)\b/gi, 'PVR'],
    [/\b(i\s+and\s+o|eyes\s+and\s+ohs)\b/gi, 'I&O'],
    [/\b(s\s*p\s*o\s*2)\b/gi, 'SpO2'],
    [/\b(m\s*a\s*p)\b(?=\s*(?:<|>|\d|is|of|goal|target))/gi, 'MAP'],
    [/\b(milligrams?)\b/gi, 'mg'],
    [/\b(micrograms?)\b/gi, 'mcg'],
    [/\b(milliliters?)\b/gi, 'mL'],
    [/\b(milliequivalents?)\b/gi, 'mEq'],
    [/\b(liters?\s+per\s+minute)\b/gi, 'L/min'],
    [/\b(beats?\s+per\s+minute)\b/gi, 'bpm'],
    [/\b(kilograms?)\b/gi, 'kg'],
    [/\b(q\s*2\s*hours?|q2\s*h)\b/gi, 'q2h'],
    [/\b(q\s*4\s*hours?|q4\s*h)\b/gi, 'q4h'],
    [/\b(q\s*6\s*hours?|q6\s*h)\b/gi, 'q6h'],
    [/\b(q\s*8\s*hours?|q8\s*h)\b/gi, 'q8h'],
    [/\b(q\s*12\s*hours?|q12\s*h)\b/gi, 'q12h'],
    [/\b(b\s*i\s*d)\b/gi, 'BID'],
    [/\b(t\s*i\s*d)\b/gi, 'TID'],
    [/\b(q\s*i\s*d)\b/gi, 'QID'],
    [/\b(p\s*r\s*n)\b/gi, 'PRN'],
    [/\b(q\s*h\s*s)\b/gi, 'qHS'],
    [/\b(a\s*c\s*h\s*s)\b/gi, 'ACHS']
  ];

  // Auto-harvested inpatient medical lexicon (2,000+ clinical words) for 5-best reranking
  let medicalLexicon = null;
  let customVocabRules = []; // [{ heard: 'sepia beam', replace: 'cefepime' }]

  const COMMON_STOP_WORDS = new Set([
    'with','from','that','this','have','will','been','were','when','what','your','they','them',
    'then','than','into','over','after','before','also','only','each','more','most','some','such',
    'other','about','which','their','there','where','while','could','would','should','daily','today',
    'patient','patients','history','normal','mild','moderate','severe','acute','chronic','stable'
  ]);

  function getMedicalLexicon() {
    if (medicalLexicon) return medicalLexicon;
    const set = new Set([
      'sepsis','urosepsis','septic','hyponatremia','hypernatremia','hyperkalemia','hypokalemia',
      'hypercalcemia','hypomagnesemia','leukocytosis','thrombocytopenia','pancytopenia','neutropenia',
      'melena','hematochezia','hematemesis','hematuria','dyspnea','orthopnea','tachycardia','tachypnea',
      'bradycardia','afib','nstemi','stemi','hfref','hfpef','adhf','copd','dka','hhs','aki','ckd','esrd',
      'pyelonephritis','pneumonia','pneumothorax','pneumonitis','effusion','empyema','bronchiectasis',
      'cellulitis','bacteremia','fungemia','endocarditis','pericarditis','meningitis','cholangitis',
      'cholecystitis','pancreatitis','diverticulitis','appendicitis','peritonitis','cirrhosis','ascites',
      'varices','ileus','gastroparesis','hydronephrosis','nephrolithiasis','rhabdomyolysis','mrsa','mssa',
      'esbl','pseudomonas','klebsiella','paracentesis','thoracentesis','syncope','osteomyelitis',
      'encephalopathy','hemoptysis','dysphagia','hemolysis','coagulopathy','vasculitis','delirium',
      'cefepime','ceftriaxone','cefazolin','cephalexin','piperacillin','tazobactam','ampicillin','sulbactam',
      'vancomycin','daptomycin','linezolid','clindamycin','meropenem','ertapenem','metronidazole',
      'azithromycin','doxycycline','levofloxacin','ciprofloxacin','fidaxomicin','micafungin','fluconazole',
      'acyclovir','oseltamivir','furosemide','bumetanide','torsemide','metolazone','acetazolamide',
      'spironolactone','metoprolol','carvedilol','labetalol','nicardipine','amlodipine','hydralazine',
      'diltiazem','amiodarone','digoxin','lisinopril','losartan','sacubitril','valsartan','empagliflozin',
      'dapagliflozin','atorvastatin','rosuvastatin','apixaban','rivaroxaban','warfarin','enoxaparin',
      'clopidogrel','ticagrelor','tenecteplase','alteplase','norepinephrine','vasopressin','phenylephrine',
      'midodrine','fludrocortisone','hydrocortisone','methylprednisolone','dexamethasone','prednisone',
      'pantoprazole','famotidine','octreotide','ondansetron','metoclopramide','lactulose','rifaximin',
      'haloperidol','quetiapine','olanzapine','lorazepam','diazepam','phenobarbital','levetiracetam',
      'gabapentin','hydromorphone','acetaminophen','ketorolac','glargine','lispro','aspart','albuterol',
      'ipratropium','tiotropium','tamsulosin','colchicine','allopurinol','buprenorphine','naltrexone',
      'thiamine','creatinine','troponin','procalcitonin','lactate','bipap','cpap','hfnc','ctpa','pocus'
    ]);

    if (typeof DOTPHRASE_STRUCTURED_DATA !== 'undefined' && Array.isArray(DOTPHRASE_STRUCTURED_DATA.phrases)) {
      DOTPHRASE_STRUCTURED_DATA.phrases.forEach(p => {
        const blob = [p.title, p.assessment, ...(p.workup || []), ...(p.plan || []), p.redFlags || ''].join(' ');
        const words = blob.toLowerCase().match(/[a-z]{4,}/g) || [];
        words.forEach(w => {
          if (!COMMON_STOP_WORDS.has(w)) set.add(w);
        });
      });
    }
    medicalLexicon = set;
    return set;
  }

  function setCustomVocab(list) {
    customVocabRules = Array.isArray(list)
      ? list.filter(item => item && item.heard && item.replace)
      : [];
  }

  function getLexiconSize() {
    return getMedicalLexicon().size + customVocabRules.length;
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Evaluates all up-to-5 speech hypotheses from Chrome/Edge and selects
   * the alternative with the highest clinical/medical relevance score.
   */
  function pickBestMedicalAlternative(speechResult) {
    if (!speechResult || !speechResult.length) return '';
    if (speechResult.length === 1) return speechResult[0].transcript || '';

    const lex = getMedicalLexicon();
    const customTargets = new Set(customVocabRules.map(r => r.replace.toLowerCase()));
    let bestTranscript = speechResult[0].transcript || '';
    let bestScore = -Infinity;

    for (let i = 0; i < speechResult.length; i++) {
      const alt = speechResult[i];
      const text = (alt.transcript || '').trim();
      if (!text) continue;

      // Preserve slight preference for engine's top confidence while rewarding clinical vocabulary hits
      let score = (typeof alt.confidence === 'number' && alt.confidence > 0 ? alt.confidence : 0.72) - i * 0.035;
      const lower = text.toLowerCase();
      const tokens = lower.match(/[a-z]{3,}/g) || [];

      for (const tok of tokens) {
        if (lex.has(tok) || customTargets.has(tok)) score += 0.14;
      }
      // Reward recognizable clinical dosing / vitals / lab patterns
      if (/\b\d+\s*(?:mg|mcg|ml|meq|kg|bpm|units?)\b/i.test(text)) score += 0.12;
      if (/\b(?:q\d+h|bid|tid|qid|prn|iv|po|sq|spo2|bp|hr|rr)\b/i.test(text)) score += 0.10;
      if (/\b\d{2,3}\s*(?:\/|over)\s*\d{2,3}\b/i.test(text)) score += 0.10;

      if (score > bestScore) {
        bestScore = score;
        bestTranscript = text;
      }
    }
    return bestTranscript;
  }

  function formatMedicalDictation(raw) {
    if (!raw) return '';
    let text = raw.trim();
    const replacements = [
      [/\bnew paragraph\b/gi, '\n\n'],
      [/\bnew line\b/gi, '\n'],
      [/\bnext bullet\b|\bnew bullet\b/gi, '\n- '],
      // "period" / "colon" are clinical words too: only treat as punctuation outside clinical context
      [/(\b[a-z]+\s+)?\bperiod\b/gi, (m, prev) => (prev && /^(refractory|postpartum|postoperative|post-op|incubation|washout|window|grace|recovery|observation|trial|time|waiting|menstrual|latent)\s+$/i.test(prev)) ? m : `${prev || ''}.`],
      [/\bfull stop\b/gi, '.'],
      [/\bcomma\b/gi, ','],
      [/(\b[a-z]+\s+)?\bcolon\b(\s+(?:cancer|polyps?|mass|wall|resection|carcinoma|lesion|perforation|dilation|distension))?/gi,
        (m, prev, next) => (next || (prev && /^(sigmoid|ascending|descending|transverse|right|left|the|of|distal|proximal|entire|whole|redundant|spastic)\s+$/i.test(prev))) ? m : `${prev || ''}:`],
      [/\bsemicolon\b/gi, ';'],
      [/\bquestion mark\b/gi, '?'],
      [/\barrow\b/gi, '->'],
      [/\bplus or minus\b/gi, '+/-'],
      [/\bgreater than or equal to\b/gi, '>='],
      [/\bless than or equal to\b/gi, '<='],
      [/\bgreater than\b/gi, '>'],
      [/\bless than\b/gi, '<'],
      [/\bpercent\b/gi, '%'],
      // Spoken decimals & BP ratios: "3 point 4" -> "3.4", "120 over 80" -> "120/80"
      [/(\d+)\s+point\s+(\d+)/gi, '$1.$2'],
      [/\b(\d{2,3})\s+over\s+(\d{2,3})\b/gi, '$1/$2'],
      // Spoken times multiplier: "times 2" -> "x2"
      [/\btimes\s+(\d+)\b/gi, 'x$1']
    ];
    for (const [pattern, rep] of replacements) {
      text = text.replace(pattern, rep);
    }

    // Apply user's custom personal medical auto-correct rules first
    for (const rule of customVocabRules) {
      const re = new RegExp(`\\b${escapeRegex(rule.heard.trim())}\\b`, 'gi');
      text = text.replace(re, rule.replace.trim());
    }

    for (const [pattern, rep] of MEDICAL_PHONETIC_FIXES) {
      text = text.replace(pattern, rep);
    }

    // Spoken lab name shorthand when followed directly by a number
    text = text
      .replace(/\bsodium\s+(?=\d)/gi, 'Na ')
      .replace(/\bpotassium\s+(?=\d)/gi, 'K ')
      .replace(/\bcreatinine\s+(?=\d)/gi, 'Cr ')
      .replace(/\bbicarb(?:onate)?\s+(?=\d)/gi, 'HCO3 ')
      .replace(/\bmagnesium\s+(?=\d)/gi, 'Mg ')
      .replace(/\bphosphorus\s+(?=\d)/gi, 'Phos ')
      .replace(/\bcalcium\s+(?=\d)/gi, 'Ca ')
      .replace(/\bblood\s+pressure\s+(?=\d)/gi, 'BP ')
      .replace(/\bheart\s+rate\s+(?=\d)/gi, 'HR ')
      .replace(/\brespiratory\s+rate\s+(?=\d)/gi, 'RR ');

    // Clean spaces before punctuation
    text = text.replace(/\s+([.,:;?%])/g, '$1');
    return text;
  }

  function stop() {
    continuousCommand = false;
    freestyleActive = false;
    const prevFreestyleCb = freestyleCallbacks;
    freestyleCallbacks = null;
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.stop();
      } catch (e) {
        // ignore
      }
      recognition = null;
    }
    if (activeButtonEl) {
      activeButtonEl.classList.remove('is-listening');
      activeButtonEl = null;
    }
    activeMode = null;
    activeFieldEl = null;
    if (prevFreestyleCb?.onStateChange) prevFreestyleCb.onStateChange(false);
    if (prevFreestyleCb?.onInterim) prevFreestyleCb.onInterim('');
    callbacks.onStatusChange({ listening: false, mode: null });
    callbacks.onInterim('');
  }

  function createRecognition({ continuous = false } = {}) {
    if (!SpeechRec) return null;
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 5; // Evaluate up to 5 hypotheses with medical lexicon reranker
    rec.continuous = continuous;
    return rec;
  }

  function startCommandMode(continuous = true) {
    if (!voiceAllowed()) return false;
    if (!isSupported()) {
      callbacks.onError('Speech recognition requires Chrome or Edge (Web Speech API not found in this browser).');
      return false;
    }
    if (activeMode === 'command') {
      stop();
      return false;
    }
    stop();

    activeMode = 'command';
    continuousCommand = continuous;
    recognition = createRecognition({ continuous: true });

    recognition.onstart = () => {
      callbacks.onStatusChange({ listening: true, mode: 'command' });
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res.isFinal ? pickBestMedicalAlternative(res) : res[0].transcript;
        if (res.isFinal) {
          callbacks.onInterim('');
          callbacks.onCommandResult(formatMedicalDictation(transcript).trim());
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        callbacks.onInterim(interim.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        return; // normal pause in continuous mode
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        callbacks.onError(
          'Microphone permission denied. Allow microphone access for RoundingOS in browser settings.'
        );
        stop();
        return;
      }
      if (event.error === 'network') {
        callbacks.onError('Speech recognition network error. Chrome/Edge Web Speech API requires internet connectivity for voice transcription.');
        stop();
        return;
      }
      callbacks.onError(`Speech recognition error: ${event.error}`);
      stop();
    };

    recognition.onend = () => {
      if (activeMode === 'command' && continuousCommand) {
        // Restart smoothly to keep continuous hands-free listening alive
        try {
          recognition.start();
        } catch (e) {
          stop();
        }
      } else {
        stop();
      }
    };

    try {
      recognition.start();
      return true;
    } catch (e) {
      callbacks.onError(`Could not start microphone: ${e.message}`);
      stop();
      return false;
    }
  }

  function toggleDictation(fieldEl, buttonEl, opts = {}) {
    if (!voiceAllowed()) return false;
    if (!isSupported()) {
      callbacks.onError('Speech recognition requires Chrome or Edge.');
      return false;
    }
    // If already dictating into this exact field, stop
    if (activeMode === 'dictation' && activeFieldEl === fieldEl) {
      stop();
      return false;
    }
    stop();

    activeMode = 'dictation';
    activeFieldEl = fieldEl;
    activeButtonEl = buttonEl || null;
    if (activeButtonEl) {
      activeButtonEl.classList.add('is-listening');
    }

    const replaceMode = Boolean(opts.replace) || fieldEl.type === 'number' || fieldEl.dataset.dictateReplace === 'true';
    recognition = createRecognition({ continuous: !replaceMode });

    recognition.onstart = () => {
      callbacks.onStatusChange({ listening: true, mode: 'dictation', fieldId: fieldEl.id });
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res.isFinal ? pickBestMedicalAlternative(res) : res[0].transcript;
        if (res.isFinal) {
          let formatted = formatMedicalDictation(transcript);
          if (formatted && activeFieldEl) {
            if (activeFieldEl.type === 'number') {
              const numMatch = formatted.match(/\d+(?:\.\d+)?/);
              if (numMatch) activeFieldEl.value = numMatch[0];
            } else if (replaceMode) {
              activeFieldEl.value = formatted;
            } else {
              const current = activeFieldEl.value;
              const sep = current && !/[\s\n]$/.test(current) && !/^[.,:;?]/.test(formatted) ? ' ' : '';
              activeFieldEl.value = current + sep + formatted;
            }
            activeFieldEl.dispatchEvent(new Event('input', { bubbles: true }));
            activeFieldEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
          callbacks.onInterim('');
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        callbacks.onInterim(interim.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        callbacks.onError('Microphone access blocked. Allow mic permission in Chrome/Edge.');
      } else {
        callbacks.onError(`Dictation error: ${event.error}`);
      }
      stop();
    };

    recognition.onend = () => {
      stop();
    };

    try {
      recognition.start();
      fieldEl.focus();
      return true;
    } catch (e) {
      callbacks.onError(`Could not start dictation: ${e.message}`);
      stop();
      return false;
    }
  }

  let freestyleActive = false;
  let freestyleCallbacks = null;

  function startFreestyleSession(opts = {}) {
    const { buttonEl, onAppendFinal, onInterim, onStateChange, onError } = opts;
    if (!voiceAllowed()) return false;

    if (!isSupported()) {
      const msg = 'Built-in voice dictation requires Chrome or Edge. You can also press Win + H (Windows Voice Typing) inside the box below.';
      if (onError) onError(msg);
      callbacks.onError(msg);
      return false;
    }

    // Toggle off if already running freestyle
    if (activeMode === 'freestyle' && freestyleActive) {
      stop();
      return false;
    }
    stop();

    activeMode = 'freestyle';
    freestyleActive = true;
    freestyleCallbacks = opts;
    activeButtonEl = buttonEl || null;
    if (activeButtonEl) activeButtonEl.classList.add('is-listening');

    const launchRecognizer = () => {
      recognition = createRecognition({ continuous: true });

      recognition.onstart = () => {
        if (onStateChange) onStateChange(true);
        callbacks.onStatusChange({ listening: true, mode: 'dictation' });
      };

      recognition.onresult = (event) => {
        let interim = '';
        let finalChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) finalChunk += pickBestMedicalAlternative(res) + ' ';
          else interim += res[0].transcript;
        }
        if (onInterim) onInterim(interim.trim());
        callbacks.onInterim(interim.trim());
        if (finalChunk.trim()) {
          const formatted = formatMedicalDictation(finalChunk);
          if (onAppendFinal) onAppendFinal(formatted);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') return; // natural pause while thinking
        let msg = `Voice error: ${event.error}`;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          msg = window.location.protocol === 'file:'
            ? 'Microphone blocked on a file:// page. Open the installed app (or an https:// address), OR click inside the box and press Win + H!'
            : 'Microphone permission denied. Click the lock/mic icon in your browser address bar to allow microphone access.';
        } else if (event.error === 'audio-capture') {
          msg = 'No microphone detected. Check your Windows audio input device.';
        } else if (event.error === 'network') {
          msg = 'Browser speech service needs internet access (or use Windows Voice Typing with Win + H inside the box).';
        }
        if (onError) onError(msg);
        callbacks.onError(msg);
        stop();
      };

      recognition.onend = () => {
        if (activeMode === 'freestyle' && freestyleActive) {
          // Keep listening continuously across natural pauses until user clicks Stop
          setTimeout(() => {
            if (activeMode === 'freestyle' && freestyleActive) {
              try {
                launchRecognizer();
              } catch (e) {
                stop();
              }
            }
          }, 150);
        } else {
          stop();
        }
      };

      try {
        recognition.start();
      } catch (e) {
        const msg = `Could not start microphone: ${e.message}`;
        if (onError) onError(msg);
        callbacks.onError(msg);
        stop();
      }
    };

    launchRecognizer();
    return true;
  }

  function startOneShot(onFinalTranscript, buttonEl) {
    return startFreestyleSession({
      buttonEl,
      onAppendFinal: onFinalTranscript
    });
  }

  function inferTaskCategory(taskText) {
    if (/\b(lab|bmp|cmp|cbc|lactate|potassium|magnesium|phos|culture|troponin|hgb|inr|vbg|abg|bnp|crp)\b/i.test(taskText)) return 'Lab';
    if (/\b(consult|cardiology|nephrology|gi|gastro|id|infectious|pulm|neuro|surgery|pt|ot|icu|call)\b/i.test(taskText)) return 'Consult';
    if (/\b(cxr|ct|mri|echo|tte|ultrasound|x-ray|imaging|scan|doppler)\b/i.test(taskText)) return 'Imaging';
    if (/\b(discharge|dispo|rehab|snf|prescription|med rec|home|case management|script)\b/i.test(taskText)) return 'Dispo';
    if (/\b(family|wife|husband|son|daughter|spouse|poa|update)\b/i.test(taskText)) return 'Family';
    if (/\b(order|replete|hold|start|stop|switch|transition|drip|antibiotic|lasix|heparin|insulin)\b/i.test(taskText)) return 'Order';
    if (/\b(picc|egd|cath|line|paracentesis|procedure|consent|biopsy|intubat)\b/i.test(taskText)) return 'Procedure';
    return 'General';
  }

  /**
   * Deep freestyle hospitalist clinical dictation parser.
   * Extracts demographics, acuity, code status, allergies, diagnosis,
   * vitals, labs, outputs/I&O, weight, consults, tasks, contingencies, and disposition.
   */
  function parsePatientFormDictation(raw) {
    const text = formatMedicalDictation(raw || '');
    const out = {
      consults: [],
      tasks: []
    };
    if (!text) return out;

    const lower = text.toLowerCase();

    // 1. Room (e.g. "room 415B", "room 415 bravo", "bed 402A", "in 412")
    const phoneticMap = { alpha: 'A', bravo: 'B', charlie: 'C', delta: 'D' };
    const roomPhonetic = text.match(/\b(?:room|bed)\s+(\d{2,4})\s*(alpha|bravo|charlie|delta|[a-d])\b/i);
    const roomSimple = text.match(/\b(?:room|bed)\s+([a-z0-9-]{2,8})\b/i)
      || text.match(/\bin\s+(\d{3,4}[a-d]?)\b/i);
    if (roomPhonetic) {
      const suf = phoneticMap[roomPhonetic[2].toLowerCase()] || roomPhonetic[2].toUpperCase();
      out.room = `${roomPhonetic[1]}${suf}`;
    } else if (roomSimple) {
      out.room = roomSimple[1].toUpperCase();
    }

    // 2. Age & Sex (handles "72 year old gentleman", "68-year-old female", "54M", "age 81 woman")
    const ageSexM = text.match(/\b(\d{1,3})\s*(?:-?\s*year[\s-]?old\s*|yo\s*|y\/o\s*)?(male|female|gentleman|man|woman|lady|m|f)\b/i);
    if (ageSexM) {
      const parsedAge = Number(ageSexM[1]);
      if (parsedAge > 0 && parsedAge <= 120) out.age = parsedAge;
      if (ageSexM[2]) {
        out.sex = /^(f|female|woman|lady)/i.test(ageSexM[2]) ? 'F' : 'M';
      }
    } else {
      const ageOnly = text.match(/\b(?:age|aged)\s+(\d{1,3})\b/i);
      if (ageOnly) out.age = Number(ageOnly[1]);
      if (/\b(female|woman|lady|she|her|mrs\.?|ms\.?)\b/i.test(text)) out.sex = 'F';
      else if (/\b(male|gentleman|man|he|his|mr\.?)\b/i.test(text)) out.sex = 'M';
    }

    // 3. Hospital Day
    const hdM = text.match(/\b(?:hospital day|hosp day|hd|day)\s*#?\s*(\d{1,3})\b/i);
    if (hdM) out.hospitalDay = Number(hdM[1]);

    // 4. Name (handles "patient John Smith", "name is Maria Garcia", "Mr. Robert Chen", "this is Sarah Jenkins", or name right after room)
    const nonNameWords = new Set([
      'room', 'bed', 'sick', 'stable', 'watcher', 'critical', 'unstable', 'full', 'code',
      'dnr', 'dni', 'comfort', 'care', 'male', 'female', 'man', 'woman', 'gentleman', 'lady',
      'admitted', 'presenting', 'diagnosis', 'allergies', 'allergic', 'nkda', 'vitals', 'labs',
      'year', 'old', 'patient', 'this', 'here', 'with', 'for', 'the', 'and', 'new', 'very', 'day',
      'hospital', 'sepsis', 'pneumonia', 'heart', 'failure', 'bleed', 'stroke', 'chest', 'pain',
      'is', 'a', 'an', 'has', 'was', 'with', 'in', 'on', 'at', 'from', 'who', 'that'
    ]);
    const cleanCandidateName = (rawName) => {
      if (!rawName) return null;
      const parts = rawName.trim().split(/\s+/).filter(Boolean);
      const kept = [];
      for (const w of parts) {
        const clean = w.replace(/[^a-zA-Z'-]/g, '');
        if (!clean || nonNameWords.has(clean.toLowerCase())) break;
        kept.push(clean.charAt(0).toUpperCase() + clean.slice(1));
        if (kept.length >= 3) break;
      }
      return kept.length >= 1 ? kept.join(' ') : null;
    };

    const namePatterns = [
      /\b(?:patient(?:'s)?\s+name\s+is|name\s+is|named|patient\s+is|patient)\s+([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+){0,2})/i,
      /\b(?:mr\.?|mrs\.?|ms\.?)\s+([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+){0,2})/i,
      /\b(?:gentleman|man|woman|lady|male|female),?\s+(?:named\s+)?([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){1,2})/,
      /\bthis\s+is\s+(?:a\s+\d{1,3}[\s-]*year[\s-]*old\s+(?:male|female|man|woman|gentleman|lady)\s+)?([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){1,2})/
    ];
    for (const pat of namePatterns) {
      const m = text.match(pat);
      const candidate = cleanCandidateName(m?.[1]);
      if (candidate) {
        out.name = candidate;
        break;
      }
    }
    if (!out.name && (roomPhonetic || roomSimple)) {
      const rm = roomPhonetic || roomSimple;
      const afterRoom = text.slice(text.indexOf(rm[0]) + rm[0].length).replace(/^[\s,:-]+/, '');
      const guess = afterRoom.match(/^([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+){1,2})/i);
      const candidate = cleanCandidateName(guess?.[1]);
      if (candidate) out.name = candidate;
    }

    // 5. Code Status
    if (/\bdnr\s*(?:and|\/|\+)?\s*dni\b/i.test(text) || /\bdo not resuscitate.*do not intubate\b/i.test(text)) {
      out.codeStatus = 'DNR / DNI';
    } else if (/\bcomfort\s*care\b|\bhospice\b/i.test(text)) {
      out.codeStatus = 'Comfort Care';
    } else if (/\bdnr\b|\bdo not resuscitate\b/i.test(text)) {
      out.codeStatus = 'DNR / Full Intubation';
    } else if (/\bfull\s*code\b/i.test(text)) {
      out.codeStatus = 'Full Code';
    }

    // 6. Acuity / Priority
    if (/\b(very sick|sick|critical|unstable|septic shock|hypotensive|icu watch|high risk|decompensat)\b/i.test(text)) {
      out.priority = 'sick';
    } else if (/\b(watcher|watch closely|borderline|monitoring closely|moderate)\b/i.test(text)) {
      out.priority = 'watcher';
    } else if (/\b(discharge ready|discharge today|going home today|dc today|ready for discharge|ready to go home)\b/i.test(text)) {
      out.priority = 'discharge';
    } else if (/\b(stable|doing well|routine)\b/i.test(text)) {
      out.priority = 'stable';
    }

    // 7. Allergies
    if (/\b(no known drug allergies|no drug allergies|no allergies|nkda)\b/i.test(text)) {
      out.allergies = 'NKDA';
    } else {
      const algM = text.match(/\b(?:allerg(?:y|ies|ic)\s*(?:to|are|:)?\s+)([^.;\n]+?)(?=\s+(?:diagnosis|dx|admitted|came in|presenting|vitals|labs|outputs|weight|consult|need to|needs|task|if |full code|dnr|priority|sick|watcher|stable|discharge|disposition)|$|[.;,])/i)
        || text.match(/\b([a-z]+(?:\s+and\s+[a-z]+)?)\s+allerg(?:y|ies)\b/i);
      if (algM && algM[1]) out.allergies = algM[1].trim();
    }

    // 8. Primary Diagnosis
    const dxM = text.match(/\b(?:primary\s+)?(?:diagnosis|dx|admitted\s+(?:for|with)|came\s+in\s+(?:for|with)|presenting\s+(?:for|with)|here\s+(?:for|with))\s*(?:is|:)?\s+([^.;\n]+?)(?=\s+(?:vitals|bp|blood pressure|heart rate|labs|wbc|hemoglobin|creatinine|potassium|lactate|outputs|i&o|i and o|weight|consult|need to|needs to|task|to do|if |contingency|full code|dnr|allerg|discharge|disposition|he is|she is|they are)|$|[.;])/i);
    if (dxM && dxM[1]) {
      out.primaryDx = dxM[1].trim().replace(/^(?:a|an)\s+/i, '');
      out.primaryDx = out.primaryDx.charAt(0).toUpperCase() + out.primaryDx.slice(1);
    }

    // 9. Vitals extraction
    const vitalsParts = [];
    const vitalsClause = text.match(/\bvitals?\s*(?:are|:)?\s+([^.;\n]+?)(?=\s+(?:labs|outputs|i&o|weight|consult|need to|task|if |disposition|discharge)|$|[.;])/i);
    if (vitalsClause) {
      vitalsParts.push(vitalsClause[1].trim());
    } else {
      const tempM = text.match(/\b(?:temp(?:erature)?|t)\s*(?:is|of)?\s*(\d{2,3}(?:\.\d)?)\b/i);
      const hrM = text.match(/\b(?:heart rate|hr|pulse)\s*(?:is|of|to)?\s*(\d{2,3})\b/i);
      const bpM = text.match(/\b(?:blood pressure|bp)\s*(?:is|of)?\s*(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})\b/i);
      const spo2M = text.match(/\b(?:spo2|o2 sat|satting|oxygen)\s*(?:is|at|of)?\s*(\d{2,3}\s*%?(?:\s+on\s+\d+\s*(?:l|liters?)\s*(?:nc|nasal cannula|o2)?)?)/i);
      if (tempM) vitalsParts.push(`T ${tempM[1]}`);
      if (hrM) vitalsParts.push(`HR ${hrM[1]}`);
      if (bpM) vitalsParts.push(`BP ${bpM[1]}/${bpM[2]}`);
      if (spo2M) vitalsParts.push(`SpO2 ${spo2M[1].trim()}`);
    }
    if (vitalsParts.length) out.vitalsSummary = vitalsParts.join(' | ');

    // 10. Labs extraction
    const labParts = [];
    const labsClause = text.match(/\blabs?\s*(?:show|are|:)?\s+([^.;\n]+?)(?=\s+(?:vitals|outputs|i&o|weight|consult|need to|task|if |disposition|discharge)|$|[.;])/i);
    if (labsClause) {
      labParts.push(labsClause[1].trim());
    } else {
      const labRegexes = [
        ['WBC', /\b(?:wbc|white count)\s*(?:is|of)?\s*(\d+(?:\.\d+)?)/i],
        ['Hgb', /\b(?:hgb|hemoglobin)\s*(?:is|of)?\s*(\d+(?:\.\d+)?)/i],
        ['Plt', /\b(?:platelets?|plt)\s*(?:is|of)?\s*(\d+(?:\.\d+)?)/i],
        ['Cr', /\b(?:creatinine|cr)\s*(?:is|of|bumped to|up to)?\s*(\d+(?:\.\d+)?)/i],
        ['K', /\b(?:potassium|k)\s*(?:is|of)?\s*(\d+(?:\.\d+)?)/i],
        ['Na', /\b(?:sodium|na)\s*(?:is|of)?\s*(\d{3})/i],
        ['Mg', /\b(?:magnesium|mag|mg)\s*(?:is|of)?\s*(\d+(?:\.\d+)?)/i],
        ['Lactate', /\blactate\s*(?:is|of)?\s*(\d+(?:\.\d+)?)/i],
        ['Trop', /\btroponin\s*(?:is|of|peaked at)?\s*(\d+(?:\.\d+)?)/i],
        ['BNP', /\bbnp\s*(?:is|of)?\s*(\d+(?:\.\d+)?)/i]
      ];
      for (const [label, rx] of labRegexes) {
        const m = text.match(rx);
        if (m) labParts.push(`${label} ${m[1]}`);
      }
    }
    if (labParts.length) out.labsSummary = labParts.join(', ');

    // 11. Outputs / I&O
    const ioM = text.match(/\b(?:outputs?|i&o|i\s+and\s+o|urine output|uop|net\s+(?:positive|negative|plus|minus))\s*(?:is|are|:)?\s*([^.;\n]+?)(?=\s+(?:weight|labs|vitals|consult|need to|task|if |disposition|discharge)|$|[.;])/i);
    if (ioM) out.ioSummary = ioM[0].trim();

    // 12. Weight
    const wtM = text.match(/\b(?:daily\s+)?weight\s*(?:is|of|:)?\s*([^.;\n]+?)(?=\s+(?:outputs|i&o|labs|vitals|consult|need to|task|if |disposition|discharge)|$|[.;])/i)
      || text.match(/\b(\d{2,3}(?:\.\d)?\s*(?:kg|kilograms?|lbs?|pounds?)(?:\s+(?:up|down)\s+[^,.;]+)?)/i);
    if (wtM) out.weightSummary = (wtM[1] || wtM[0]).trim();

    // 13. Consults
    const specialtyCatalog = [
      ['Cardiology', /\bcardiology|cards\b/i],
      ['Nephrology', /\bnephrology|renal\b/i],
      ['Gastroenterology', /\bgastroenterology|\bgi\b/i],
      ['Infectious Disease', /\binfectious disease|\bid\s+consult\b/i],
      ['Pulmonology', /\bpulmonology|pulm\b/i],
      ['Critical Care / ICU', /\bcritical care|\bicu\b|\bmicu\b/i],
      ['Neurology', /\bneurology|neuro\b/i],
      ['General Surgery', /\bsurgery|surgical\b/i],
      ['Hematology / Oncology', /\bhematology|oncology|heme[\s-]?onc\b/i],
      ['Endocrinology', /\bendocrinology|endo\b/i],
      ['Podiatry', /\bpodiatry\b/i],
      ['Urology', /\burology\b/i],
      ['Physical Therapy', /\bphysical therapy|\bpt\/ot\b/i],
      ['Case Management', /\bcase management\b/i],
      ['Addiction Medicine', /\baddiction medicine\b/i],
      ['Palliative Care', /\bpalliative\b/i]
    ];
    if (/\b(consult|following|called|on board|need\s+[a-z]+\s+consult|page)\b/i.test(lower)) {
      for (const [svc, rx] of specialtyCatalog) {
        if (rx.test(text)) {
          out.consults.push({ service: svc, status: 'Pending', notes: 'Added via voice intake' });
        }
      }
    }

    // 14. Tasks / Action items
    const clauses = text.split(/(?:[.!?\n]+|;\s*|\band\s+(?=(?:need to|needs to|check|recheck|order|replete|follow up|call|start|hold|get|obtain|task|to do)\b))/i);
    const seenTasks = new Set();
    for (const rawClause of clauses) {
      const c = rawClause.trim();
      if (c.length < 6) continue;
      // Skip "if ..." contingency sentences from task extraction
      if (/^if\b/i.test(c)) continue;
      const taskM = c.match(/^(?:(?:we\s+)?(?:need to|needs to|have to|must|should|plan to|task|to[\s-]?do)\s+(.+)|((?:check|recheck|follow up|order|replete|call|start|hold|obtain|get|schedule|confirm|update family)\b.+))$/i);
      if (taskM) {
        const taskBody = (taskM[1] || taskM[2] || '').trim().replace(/^[,\s:-]+/, '');
        if (taskBody.length >= 4 && !seenTasks.has(taskBody.toLowerCase())) {
          seenTasks.add(taskBody.toLowerCase());
          const urgent = /\b(stat|urgent|asap|immediately|now)\b/i.test(taskBody);
          out.tasks.push({
            text: taskBody.charAt(0).toUpperCase() + taskBody.slice(1),
            category: inferTaskCategory(taskBody),
            urgent
          });
        }
      }
    }

    // 15. Contingencies ("if [trigger] (then) [action]" or "contingency ...")
    const contMatches = [];
    const contExplicit = text.match(/\bcontingenc(?:y|ies)\s*(?:is|are|:)?\s*([^.\n]+)/i);
    if (contExplicit) contMatches.push(contExplicit[1].trim());
    const ifRegex = /\bif\s+[^.!?\n]{8,180}/gi;
    let ifM;
    while ((ifM = ifRegex.exec(text)) !== null) {
      const snippet = ifM[0].trim();
      if (!contMatches.some(existing => existing.includes(snippet))) {
        contMatches.push(snippet);
      }
    }
    if (contMatches.length) out.contingencies = contMatches.join('\n');

    // 16. Disposition
    const dispoM = text.match(/\b(?:disposition|dispo|discharge\s+plan|discharge\s+to|needs\s+(?:rehab|acute rehab|snf|skilled nursing)|going\s+home\b[^.;\n]*)\s*(?:is|:)?\s*([^.;\n]*)/i);
    if (dispoM) out.disposition = dispoM[0].trim();

    // 17. One-Liner & Clinical Notes
    out.oneLiner = text.length > 240 ? text.slice(0, 237).trim() + '...' : text;
    out.clinicalNotes = text;

    return out;
  }

  /**
   * Parses natural-language hospitalist voice commands into structured actions.
   */
  function parseVoiceCommand(rawTranscript, patients) {
    const text = rawTranscript.trim();
    const lower = text.toLowerCase();

    // 1. Stop listening
    if (/^(stop listening|stop voice|mute mic|turn off mic)$/i.test(lower)) {
      return { type: 'STOP_LISTENING' };
    }

    // 2. Open Sign-Out / Handoff
    if (/(generate|open|show|create)\s+(sign[\s-]?out|sign[\s-]?off|handoff|transfer)/i.test(lower)) {
      const mode = /transfer/i.test(lower) ? 'transfer' : 'shift';
      return { type: 'OPEN_SIGNOUT', mode };
    }

    // 3. Select patient by room or name
    const roomMatch = lower.match(/^(?:select|open|go to|show|switch to)\s+(?:room|bed|patient)?\s*(\d{3,4}[a-z]?)$/i);
    if (roomMatch) {
      const targetRoom = roomMatch[1].toLowerCase();
      const found = patients.find(p => p.room.toLowerCase().replace(/\s+/g, '') === targetRoom)
        || patients.find(p => p.room.toLowerCase().startsWith(targetRoom));
      if (found) return { type: 'SELECT_PATIENT', patientId: found.id, label: `Room ${found.room} (${found.name})` };
    }

    const nameMatch = lower.match(/^(?:select|open|go to|show|switch to)\s+(?:patient\s+)?([a-z][a-z\s'-]{2,})$/i);
    if (nameMatch) {
      const q = nameMatch[1].trim();
      const words = p => p.name.toLowerCase().split(/[\s-]+/);
      const found = patients.find(p => p.name.toLowerCase() === q)
        || patients.find(p => words(p).includes(q))
        || patients.find(p => words(p).some(w => w.startsWith(q)));
      if (found) return { type: 'SELECT_PATIENT', patientId: found.id, label: `${found.name} (Rm ${found.room})` };
    }

    // 4. Next / Previous patient
    if (/^(next patient|next room)$/i.test(lower)) {
      return { type: 'STEP_PATIENT', delta: 1 };
    }
    if (/^(previous patient|last patient|previous room)$/i.test(lower)) {
      return { type: 'STEP_PATIENT', delta: -1 };
    }

    // 6. Add Task
    const taskMatch = text.match(/^(?:add|new|create)\s+(?:(urgent|stat)\s+)?(?:task|to[\s-]?do)\s+(.+)$/i);
    if (taskMatch) {
      const urgent = Boolean(taskMatch[1]) || /\b(stat|urgent|asap)\b/i.test(taskMatch[2]);
      const taskText = formatMedicalDictation(taskMatch[2]);
      let category = 'General';
      if (/\b(lab|bmp|cbc|lactate|potassium|magnesium|culture|troponin|hgb|inr|vbg|abg)\b/i.test(taskText)) category = 'Lab';
      else if (/\b(consult|cardiology|nephrology|gi|id|pulm|neuro|surgery|pt|ot|call)\b/i.test(taskText)) category = 'Consult';
      else if (/\b(cxr|ct|mri|echo|tte|ultrasound|x-ray|imaging|scan)\b/i.test(taskText)) category = 'Imaging';
      else if (/\b(discharge|dispo|rehab|snf|prescription|med rec|home|case management)\b/i.test(taskText)) category = 'Dispo';
      else if (/\b(family|wife|husband|son|daughter|poa|update)\b/i.test(taskText)) category = 'Family';
      else if (/\b(order|replete|hold|start|stop|switch|transition)\b/i.test(taskText)) category = 'Order';
      else if (/\b(picc|egd|cath|line|paracentesis|procedure|consent)\b/i.test(taskText)) category = 'Procedure';

      return { type: 'ADD_TASK', text: taskText, urgent, category };
    }

    // 7. Add Consult
    const consultMatch = text.match(/^(?:add|new|order)\s+consult\s+([a-z][a-z\s/&'-]{1,28}?)(?:\s+(?:for|regarding|re|notes?)\s+(.+))?$/i);
    if (consultMatch) {
      return {
        type: 'ADD_CONSULT',
        service: consultMatch[1].trim(),
        notes: formatMedicalDictation((consultMatch[2] || '').trim())
      };
    }

    // 8. Set Quick Clinical Fields by voice
    const fieldSetters = [
      { field: 'vitalsSummary', regex: /^(?:set|update|log)\s+vitals?\s+(.+)$/i, label: 'Vitals' },
      { field: 'labsSummary', regex: /^(?:set|update|log)\s+labs?\s+(.+)$/i, label: 'Labs' },
      { field: 'ioSummary', regex: /^(?:set|update|log)\s+(?:outputs?|i\s*and\s*o|i&o)\s+(.+)$/i, label: 'Outputs / I&O' },
      { field: 'lastBm', regex: /^(?:set|update|log)\s+(?:last\s+)?(?:bm|bowel movement)\s+(.+)$/i, label: 'Last BM' },
      { field: 'weightSummary', regex: /^(?:set|update|log)\s+weights?\s+(.+)$/i, label: 'Weight' },
      { field: 'disposition', regex: /^(?:set|update|log)\s+(?:dispo|disposition)\s+(.+)$/i, label: 'Disposition' }
    ];
    for (const setter of fieldSetters) {
      const m = text.match(setter.regex);
      if (m) {
        return { type: 'SET_FIELD', field: setter.field, label: setter.label, text: formatMedicalDictation(m[1]) };
      }
    }

    // 9. Add Contingency / Note
    const contMatch = text.match(/^(?:add|append)\s+(?:contingency|if then|sign[\s-]?out note)\s+(.+)$/i);
    if (contMatch) {
      return { type: 'APPEND_FIELD', field: 'contingencies', text: formatMedicalDictation(contMatch[1]) };
    }

    // 10. Set Follow-Up Alarm / Reminder ("remind me in 2 hours check potassium", "set alarm at 11:00 repeat troponin")
    const relRem = text.match(/^(?:remind me|set (?:an? )?(?:alarm|reminder))\s+in\s+(\d+)\s*(min(?:ute)?s?|hours?|hrs?)\s+(?:to\s+)?(.+)$/i);
    if (relRem) {
      const qty = parseInt(relRem[1], 10);
      const isHr = /^h/i.test(relRem[2]);
      const mins = isHr ? qty * 60 : qty;
      return { type: 'ADD_REMINDER_REL', minutes: mins, text: formatMedicalDictation(relRem[3]) };
    }

    const absRem = text.match(/^(?:remind me|set (?:an? )?(?:alarm|reminder))\s+(?:at|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+(?:to\s+)?(.+)$/i);
    if (absRem) {
      let hr = parseInt(absRem[1], 10);
      const min = absRem[2] ? parseInt(absRem[2], 10) : 0;
      const ampm = (absRem[3] || '').toLowerCase();
      if (ampm === 'pm' && hr < 12) hr += 12;
      if (ampm === 'am' && hr === 12) hr = 0;
      const hhmm = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      return { type: 'ADD_REMINDER_AT', timeStr: hhmm, text: formatMedicalDictation(absRem[4]) };
    }
    const noteMatch = text.match(/^(?:add|append)\s+(?:clinical\s+)?note\s+(.+)$/i);
    if (noteMatch) {
      return { type: 'APPEND_FIELD', field: 'clinicalNotes', text: formatMedicalDictation(noteMatch[1]) };
    }

    // Priority / acuity — anchored, and evaluated AFTER task / field / reminder parsers so that
    // "set dispo discharge to SNF" or "set labs troponin ordered" are never read as acuity changes.
    const prio = lower.match(/^(?:mark|set|make|flag)\s+(?:(?:patient|as|to|him|her)\s+)*(sick|critical|unstable|watcher|watch|discharge(?: ready)?|dc today|stable)(?:\s+(?:today|now))?$/i);
    if (prio) {
      const w = prio[1].toLowerCase();
      const priority = /sick|critical|unstable/.test(w) ? 'sick'
        : /watch/.test(w) ? 'watcher'
        : /discharge|dc/.test(w) ? 'discharge' : 'stable';
      return { type: 'SET_PRIORITY', priority };
    }

    // 10. Search census
    const searchMatch = text.match(/^(?:search|find)\s+(.+)$/i);
    if (searchMatch) {
      return { type: 'SEARCH', query: searchMatch[1].trim() };
    }

    // 11. Check all pre-round
    if (/(?:check|mark|complete)\s+all\s+pre[\s-]?round/i.test(lower)) {
      return { type: 'CHECK_ALL_PREROUND' };
    }

    // 12. Checklist toggle
    const uncheck = /\b(uncheck|unmark|clear|undo)\b/i.test(lower);
    const checklistAliases = [
      { id: 'labs', pattern: /\b(labs?|blood work|chemistry|cultures?)\b/i },
      { id: 'outputs', pattern: /\b(outputs?|i\s*and\s*o|i&o|intake|urine|uop|fluid balance)\b/i },
      { id: 'bm', pattern: /\b(bm|bowel movement|bowels?|stool|last bm)\b/i },
      { id: 'consults', pattern: /\b(consults?|consult notes?|specialists?)\b/i },
      { id: 'vitals', pattern: /\b(vitals?|telemetry|tele)\b/i },
      { id: 'imaging', pattern: /\b(imaging|radiology|x-ray|micro)\b/i },
      { id: 'overnight', pattern: /\b(overnight|events?|nursing notes?)\b/i },
      { id: 'meds', pattern: /\b(meds?|medications?|mar|med rec)\b/i },
      { id: 'seen', pattern: /\b(seen|saw patient|patient seen|examined|rounded)\b/i },
      { id: 'note', pattern: /\b(note|progress note|documentation|signed note)\b/i },
      { id: 'orders', pattern: /\b(orders?)\b/i },
      { id: 'family', pattern: /\b(family|nurse|rn sync)\b/i }
    ];

    if (/\b(check|mark|done|reviewed|completed?|finish|uncheck|unmark|clear|seen|saw)\b/i.test(lower)) {
      const matchedIds = checklistAliases
        .filter(item => item.pattern.test(lower))
        .map(item => item.id);
      if (matchedIds.length > 0) {
        return { type: 'SET_CHECKLIST', ids: matchedIds, value: !uncheck };
      }
    }

    return { type: 'UNRECOGNIZED', raw: text };
  }

  return {
    isSupported,
    init,
    setEnabled,
    isEnabled: () => voiceEnabled,
    startCommandMode,
    toggleDictation,
    startFreestyleSession,
    startOneShot,
    parsePatientFormDictation,
    formatMedicalDictation,
    setCustomVocab,
    getLexiconSize,
    stop,
    parseVoiceCommand,
    getMode: () => activeMode
  };
})();

