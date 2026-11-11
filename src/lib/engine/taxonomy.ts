/**
 * Research concept taxonomy used by the baseline matcher.
 *
 * Each concept has a canonical label, the phrases that signal it in free text,
 * and a small set of related concepts. Related concepts give the deterministic
 * matcher a little "semantic" reach (battery → energy storage) without any
 * model calls. A future semantic matcher can ignore this file entirely.
 */

export interface Concept {
  id: string;
  label: string;
  domain: Domain;
  phrases: string[]; // lowercase; matched on word boundaries after normalization
  related: string[];
}

export type Domain =
  | 'Energy'
  | 'Materials'
  | 'Computing & AI'
  | 'Health & Life Sciences'
  | 'Agriculture & Food'
  | 'Environment'
  | 'Manufacturing'
  | 'Aerospace & Mobility'
  | 'Electronics'
  | 'Business & Society';

const c = (id: string, label: string, domain: Domain, phrases: string[], related: string[] = []): Concept => ({
  id, label, domain, phrases: [label.toLowerCase(), ...phrases], related,
});

export const CONCEPTS: Concept[] = [
  // Energy
  c('solid-state-batteries', 'Solid-state batteries', 'Energy', ['solid state battery', 'solid state batteries', 'solid-state battery', 'solid electrolyte', 'solid electrolytes', 'lithium metal anode'], ['energy-storage', 'electrochemistry', 'battery-materials']),
  c('battery-materials', 'Battery materials', 'Energy', ['cathode', 'anode', 'lithium-ion', 'lithium ion', 'li-ion', 'battery chemistry', 'batteries', 'battery'], ['energy-storage', 'electrochemistry', 'solid-state-batteries']),
  c('energy-storage', 'Energy storage', 'Energy', ['grid storage', 'storage systems', 'storing energy', 'stationary storage'], ['battery-materials', 'power-systems', 'solid-state-batteries']),
  c('electrochemistry', 'Electrochemistry', 'Energy', ['electrochemical', 'electrode', 'electrodes', 'electrochemical interfaces', 'interfaces'], ['battery-materials', 'fuel-cells', 'corrosion']),
  c('fuel-cells', 'Fuel cells & hydrogen', 'Energy', ['fuel cell', 'hydrogen', 'electrolyzer', 'electrolysis', 'green hydrogen'], ['electrochemistry', 'catalysis']),
  c('power-systems', 'Power systems & grid', 'Energy', ['power grid', 'grid', 'power electronics', 'microgrid', 'microgrids', 'grid integration', 'utility'], ['energy-storage', 'renewables', 'smart-buildings']),
  c('renewables', 'Renewable energy', 'Energy', ['renewables', 'renewable', 'solar', 'photovoltaic', 'photovoltaics', 'wind energy', 'wind turbine', 'clean energy'], ['power-systems', 'energy-storage']),
  c('subsurface-energy', 'Subsurface & geo-energy', 'Energy', ['geothermal', 'reservoir', 'natural gas', 'carbon storage', 'subsurface'], ['carbon-capture', 'geosciences']),
  c('nuclear', 'Nuclear engineering', 'Energy', ['nuclear', 'reactor', 'fission', 'radiation'], ['materials-characterization']),

  // Materials
  c('polymers', 'Polymers', 'Materials', ['polymer', 'polymeric', 'plastics', 'macromolecular'], ['sustainable-materials', 'composites']),
  c('ceramics', 'Ceramics & glass', 'Materials', ['ceramic', 'glass', 'oxide ceramics'], ['battery-materials', 'materials-characterization']),
  c('2d-materials', '2D materials', 'Materials', ['graphene', 'two-dimensional materials', 'transition metal dichalcogenides', 'tmd', 'atomically thin'], ['semiconductors', 'nanomaterials']),
  c('nanomaterials', 'Nanomaterials', 'Materials', ['nanoparticle', 'nanoparticles', 'nanoscale', 'nanostructured'], ['2d-materials', 'drug-delivery']),
  c('composites', 'Composites', 'Materials', ['composite', 'fiber reinforced', 'carbon fiber'], ['polymers', 'aerostructures']),
  c('materials-characterization', 'Materials characterization', 'Materials', ['microscopy', 'electron microscopy', 'x-ray diffraction', 'spectroscopy', 'characterization'], ['ceramics', 'nanomaterials']),
  c('computational-materials', 'Computational materials science', 'Materials', ['phase-field', 'phase field', 'first-principles', 'dft', 'materials modeling', 'atomistic simulation'], ['materials-characterization', 'machine-learning']),
  c('sustainable-materials', 'Sustainable materials', 'Materials', ['recycling', 'recyclable', 'biodegradable', 'circular economy', 'bio-based', 'sustainable manufacturing'], ['polymers', 'advanced-manufacturing']),
  c('corrosion', 'Corrosion & coatings', 'Materials', ['coating', 'coatings', 'corrosion resistance', 'surface protection'], ['electrochemistry']),
  c('catalysis', 'Catalysis', 'Materials', ['catalyst', 'catalysts', 'catalytic'], ['fuel-cells', 'carbon-capture', 'chemical-processes']),

  // Manufacturing
  c('additive-manufacturing', 'Additive manufacturing', 'Manufacturing', ['3d printing', '3-d printing', 'metal printing', 'additively manufactured', 'powder bed fusion'], ['advanced-manufacturing', 'composites']),
  c('advanced-manufacturing', 'Advanced manufacturing', 'Manufacturing', ['manufacturing', 'production scale-up', 'scale-up', 'process engineering', 'factory'], ['additive-manufacturing', 'industrial-automation']),
  c('industrial-automation', 'Industrial automation & robotics', 'Manufacturing', ['robotics', 'robot', 'robots', 'automation', 'industrial robotics'], ['advanced-manufacturing', 'computer-vision']),
  c('chemical-processes', 'Chemical process engineering', 'Manufacturing', ['chemical engineering', 'process design', 'separations', 'reactor design'], ['catalysis', 'advanced-manufacturing']),
  c('supply-chain', 'Supply chain & logistics', 'Business & Society', ['logistics', 'supply chains', 'operations research', 'inventory', 'freight'], ['optimization']),

  // Computing & AI
  c('machine-learning', 'Machine learning', 'Computing & AI', ['ml', 'deep learning', 'neural network', 'neural networks', 'artificial intelligence', 'ai'], ['computer-vision', 'nlp', 'data-science']),
  c('computer-vision', 'Computer vision', 'Computing & AI', ['image analysis', 'visual recognition', 'imaging ai', 'object detection'], ['machine-learning', 'medical-imaging']),
  c('nlp', 'Natural language processing', 'Computing & AI', ['language models', 'large language models', 'llm', 'llms', 'text mining'], ['machine-learning', 'responsible-ai']),
  c('responsible-ai', 'Responsible & trustworthy AI', 'Computing & AI', ['ai ethics', 'fairness', 'explainable ai', 'ai safety', 'trustworthy ai', 'ai governance'], ['machine-learning', 'nlp']),
  c('cybersecurity', 'Cybersecurity', 'Computing & AI', ['security', 'privacy', 'cyber', 'intrusion detection', 'secure systems'], ['networks', 'edge-computing']),
  c('data-science', 'Data science & analytics', 'Computing & AI', ['analytics', 'big data', 'data analytics', 'statistics', 'statistical modeling'], ['machine-learning', 'optimization']),
  c('edge-computing', 'Edge & embedded computing', 'Computing & AI', ['edge ai', 'embedded systems', 'iot', 'internet of things', 'sensor networks'], ['semiconductors', 'networks']),
  c('networks', 'Wireless & networking', 'Computing & AI', ['wireless', '5g', '6g', 'networking', 'communications'], ['edge-computing', 'cybersecurity']),
  c('hpc', 'High-performance computing', 'Computing & AI', ['supercomputing', 'parallel computing', 'gpu computing', 'simulation at scale', 'gpu', 'gpus', 'cuda', 'gpu programming', 'gpu kernels', 'gpu ecosystem', 'compute infrastructure'], ['data-science', 'computational-materials']),
  c('optimization', 'Optimization & operations research', 'Computing & AI', ['optimisation', 'scheduling', 'mathematical programming', 'decision models'], ['supply-chain', 'data-science']),
  c('hci', 'Human–computer interaction', 'Computing & AI', ['user experience', 'usability', 'human factors', 'interaction design'], ['responsible-ai']),
  c('quantum-computing', 'Quantum computing', 'Computing & AI', ['quantum computing', 'quantum information', 'quantum algorithms', 'qubit', 'qubits', 'superconducting qubit', 'quantum devices', 'quantum sensing', 'post-quantum'], ['hpc', 'semiconductors', 'photonics', 'machine-learning']),
  c('cloud-computing', 'Cloud & enterprise computing', 'Computing & AI', ['cloud computing', 'cloud platform', 'cloud', 'hybrid cloud', 'cloud services', 'enterprise it', 'virtualization', 'distributed systems'], ['hpc', 'machine-learning', 'networks']),

  // Electronics
  c('semiconductors', 'Semiconductors', 'Electronics', ['semiconductor', 'chips', 'chip', 'transistor', 'transistors', 'microelectronics', 'wide bandgap', 'gallium nitride', 'silicon carbide'], ['2d-materials', 'edge-computing']),
  c('photonics', 'Photonics & optics', 'Electronics', ['optics', 'optical', 'laser', 'lasers', 'photonic'], ['semiconductors', 'sensors']),
  c('sensors', 'Sensors & instrumentation', 'Electronics', ['sensor', 'sensing', 'instrumentation', 'wearable sensors'], ['edge-computing', 'photonics']),

  // Aerospace & mobility
  c('aerostructures', 'Aerospace structures', 'Aerospace & Mobility', ['aerospace', 'aircraft', 'airframe', 'hypersonic', 'thermal protection'], ['composites', 'additive-manufacturing']),
  c('propulsion', 'Propulsion & combustion', 'Aerospace & Mobility', ['turbine', 'turbines', 'gas turbine', 'gas turbines', 'jet engine', 'jet engines', 'turbofan', 'engines', 'propulsion', 'combustion', 'combustor', 'mro', 'maintenance repair and overhaul', 'overhaul', 'sustainment', 'engine sustainment'], ['sustainable-aviation-fuels', 'aerostructures', 'additive-manufacturing', 'renewables']),
  c('sustainable-aviation-fuels', 'Sustainable aviation fuels', 'Aerospace & Mobility', ['sustainable aviation fuel', 'aviation fuel', 'jet fuel', 'biofuel', 'biofuels', 'drop-in fuels'], ['propulsion', 'renewables', 'chemical-processes']),
  c('defense-systems', 'Defense systems', 'Aerospace & Mobility', ['missile defense', 'interceptor', 'interceptors', 'radar', 'electronic warfare', 'military systems', 'defense technology', 'military aircraft'], ['aerostructures', 'autonomy', 'cybersecurity']),
  c('autonomy', 'Autonomous systems', 'Aerospace & Mobility', ['autonomous vehicles', 'drones', 'uav', 'uavs', 'self-driving', 'autonomy'], ['industrial-automation', 'computer-vision']),
  c('transportation', 'Transportation & EVs', 'Aerospace & Mobility', ['electric vehicle', 'electric vehicles', 'ev', 'evs', 'vehicle electrification', 'mobility'], ['battery-materials', 'power-systems']),
  c('acoustics', 'Acoustics & vibration', 'Aerospace & Mobility', ['acoustic', 'noise', 'vibration', 'ultrasound'], ['sensors']),

  // Health & life sciences
  c('drug-delivery', 'Drug delivery', 'Health & Life Sciences', ['lipid nanoparticles', 'lnp', 'controlled release', 'therapeutic delivery', 'mrna delivery'], ['nanomaterials', 'biomaterials', 'immunology']),
  c('biomaterials', 'Biomaterials', 'Health & Life Sciences', ['tissue engineering', 'hydrogel', 'hydrogels', 'implant', 'implants', 'regenerative'], ['drug-delivery', 'polymers']),
  c('medical-imaging', 'Medical imaging', 'Health & Life Sciences', ['mri', 'radiology', 'ultrasound imaging', 'biomedical imaging'], ['computer-vision', 'acoustics']),
  c('immunology', 'Immunology & vaccines', 'Health & Life Sciences', ['vaccine', 'vaccines', 'immune', 'immunotherapy', 'antibody', 'antibodies'], ['drug-delivery', 'infectious-disease']),
  c('pharmaceuticals', 'Pharmaceutical development', 'Health & Life Sciences', ['pharmaceutical', 'pharmaceuticals', 'drug formulation', 'formulation', 'dermatology', 'dermatological', 'topical', 'therapeutics', 'adjuvant', 'adjuvants'], ['drug-delivery', 'immunology']),
  c('adhesives', 'Adhesives & bonding', 'Materials', ['adhesive', 'adhesives', 'adhesion', 'bonding', 'tapes', 'glue'], ['polymers']),
  c('infectious-disease', 'Infectious disease', 'Health & Life Sciences', ['virus', 'viral', 'pathogen', 'pathogens', 'antimicrobial', 'epidemiology'], ['immunology']),
  c('digital-health', 'Digital health', 'Health & Life Sciences', ['health informatics', 'telehealth', 'wearables', 'clinical decision support', 'mhealth', 'remote monitoring'], ['machine-learning', 'sensors']),
  c('genomics', 'Genomics & bioinformatics', 'Health & Life Sciences', ['genomic', 'genome', 'sequencing', 'bioinformatics', 'gene editing', 'crispr'], ['data-science', 'plant-science']),
  c('nutrition', 'Nutrition science', 'Health & Life Sciences', ['nutrition', 'diet', 'dietary', 'metabolism'], ['food-science']),
  c('neuroscience', 'Neuroscience', 'Health & Life Sciences', ['brain', 'neural', 'cognitive', 'neurodegeneration'], ['medical-imaging']),

  // Agriculture & food
  c('plant-science', 'Plant science & crops', 'Agriculture & Food', ['crop', 'crops', 'plant', 'plants', 'agronomy', 'crop resilience'], ['genomics', 'precision-agriculture']),
  c('precision-agriculture', 'Precision agriculture', 'Agriculture & Food', ['agtech', 'farm', 'farming', 'agricultural sensing', 'smart farming', 'agriculture'], ['plant-science', 'sensors', 'autonomy']),
  c('food-science', 'Food science & safety', 'Agriculture & Food', ['food', 'food safety', 'food processing', 'food packaging', 'shelf life'], ['nutrition', 'sustainable-materials']),
  c('soil-water', 'Soil & water resources', 'Environment', ['soil', 'water quality', 'watershed', 'hydrology', 'irrigation'], ['precision-agriculture', 'environmental-remediation']),

  // Environment
  c('carbon-capture', 'Carbon capture & utilization', 'Environment', ['direct air capture', 'co2 capture', 'carbon dioxide removal', 'decarbonization', 'carbon utilization'], ['catalysis', 'subsurface-energy']),
  c('environmental-remediation', 'Environmental remediation', 'Environment', ['pfas', 'remediation', 'contaminants', 'water treatment', 'pollution'], ['soil-water', 'catalysis']),
  c('climate', 'Climate & weather', 'Environment', ['climate', 'weather', 'atmospheric', 'meteorology', 'forecasting', 'climate risk'], ['data-science', 'renewables']),
  c('geosciences', 'Geosciences', 'Environment', ['geology', 'geophysics', 'critical minerals', 'mining', 'mineral'], ['subsurface-energy']),
  c('smart-buildings', 'Smart & sustainable buildings', 'Environment', ['building energy', 'hvac', 'built environment', 'architectural engineering', 'smart buildings'], ['power-systems', 'sensors']),

  // Business & society
  c('entrepreneurship', 'Entrepreneurship & innovation', 'Business & Society', ['startup', 'startups', 'venture', 'innovation management', 'commercialization'], ['supply-chain']),
  c('workforce', 'Workforce & talent development', 'Business & Society', ['workforce', 'internship', 'internships', 'recruiting', 'talent pipeline', 'co-op', 'hiring'], []),
];

export const CONCEPT_BY_ID: Record<string, Concept> = Object.fromEntries(CONCEPTS.map((x) => [x.id, x]));

export const conceptLabel = (id: string) => CONCEPT_BY_ID[id]?.label ?? id;

const STOP = new Set(
  'a an and are as at be by for from has have in into is it its of on or our that the their them they this to we with who looking want wants interested working work researchers researcher research collaborate collaboration company companies partner partners help need needs using use new about also like would could should more most some any across'.split(' '),
);

export function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[–—]/g, '-').replace(/[^a-z0-9\-\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** Keyword tokens that aren't stop words — used for residual lexical scoring. */
export function tokens(text: string): string[] {
  return normalize(text)
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map(stem);
}

export function stem(t: string): string {
  if (t.length > 5 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && t.endsWith('es') && !t.endsWith('ses')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/**
 * Detect concepts mentioned in free text. Longer phrases are matched first and
 * consumed so "solid-state batteries" doesn't also count as plain "batteries".
 */
export function extractConcepts(text: string): string[] {
  let hay = normalize(text).replace(/-/g, ' ');
  const pairs = CONCEPTS.flatMap((concept) =>
    concept.phrases.map((p) => ({ id: concept.id, p: ` ${p.replace(/-/g, ' ')} ` })),
  ).sort((a, b) => b.p.length - a.p.length);
  const found: string[] = [];
  for (const { id, p } of pairs) {
    if (hay.includes(p)) {
      if (!found.includes(id)) found.push(id);
      hay = hay.split(p).join(' ');
    }
  }
  return found;
}

export function relatedOf(id: string): string[] {
  return CONCEPT_BY_ID[id]?.related ?? [];
}
