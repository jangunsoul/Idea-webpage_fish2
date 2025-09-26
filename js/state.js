// Global game state and configuration values.
// These are attached to the window object so that the individual script files
// can share the same state without relying on implicit hoisting of "var".

window.DATA_URL = './data/fish.json';

window.MIN_CAST_DISTANCE = 30;
window.MAX_CAST_DISTANCE = 200;
window.MIN_SINK_DISTANCE = 24;

window.GameState = {
  Idle: 'Idle',
  Targeting: 'Targeting',
  Results: 'Results'
};

window.RARITY_WEIGHTS = {
  Common: 100,
  Uncommon: 50,
  Rare: 20,
  Epic: 8,
  Legendary: 3,
  Mythic: 1
};

window.RARITY_PRIORITY = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
  Mythic: 5
};

window.RARITY_COLORS = {
  Common: '#1d4ed8',
  Uncommon: '#10b981',
  Rare: '#8b5cf6',
  Epic: '#f97316',
  Legendary: '#facc15',
  Mythic: '#f472b6'
};

window.FISH_SWIM_SPEED_TABLE = {
  Fast: 8,
  Normal: 5,
  Slow: 3
};

window.DETECTION_RANGE_M = 5;
window.FISH_SCHOOLING_RADIUS = 18;
window.FISH_AVOIDANCE_RADIUS = 12;
window.FISH_AVOIDANCE_FORCE = 6;
window.FISH_SEPARATION_FORCE = 0.9;
window.FISH_COHESION_FORCE = 0.65;
window.FISH_ALIGNMENT_FORCE = 0.45;
window.FISH_WANDER_FORCE = 0.55;
window.FISH_CENTERING_FORCE = 0.35;
window.MINIMAP_SEGMENTS = 48;
window.MINIMAP_SEGMENT_METERS = 5;

window.loadingPromise = null;
window.assetPrepPromise = null;
window.dataLoaded = false;
window.assetsReady = false;
window.passingSchool = [];
window.passingSchoolMode = 'title';
window.state = window.GameState?.Idle ?? 'Idle';
window.resultsIndex = 0;

window.canvas = null;
window.ctx = null;
window.startBtn = null;
window.mainMenu = null;
window.titleBar = null;
window.navBar = null;
window.exitBtn = null;
window.shopBtn = null;
window.rankBtn = null;
window.premiumBtn = null;
window.toastEl = null;
window.missEffect = null;
window.distanceEl = null;
window.minimap = null;
window.mmbar = null;
window.mmCells = null;
window.mmViewport = null;
window.mmIndicator = null;
window.results = null;
window.rTitle = null;
window.rBody = null;
window.rNext = null;
window.rSkip = null;
window.energyEl = null;
window.pointsEl = null;
window.castPrompt = null;

window.gameData = {
  assets: {},
  species: [],
  characters: [],
  environment: null,
  player: null,
  resources: {
    fish: new Map(),
    icons: {}
  }
};

window.SPECIES = window.gameData.species;
window.CHARACTERS = window.gameData.characters;

window.settings = {
  energy: 10,
  points: 0,
  baseCast: 30,
  maxCast: 200,
  rodTier: 1,
  lineTier: 1
};

window.world = {
  castDistance: 0,
  bobberDist: 0,
  castStage: 'idle',
  bobberVisible: false,
  fishes: [],
  actives: [],
  catches: [],
  time: 0,
  lateralLimit: 5,
  displayRange: 5,
  targetCircle: null,
  viewZoom: 1,
  targetZoom: 1,
  sinkTimer: 0,
  sinkDuration: 0,
  sinkStartDist: 0,
  sinkEndDist: 0,
  pendingCatchSims: []
};

window.camera = { y: 0 };
window.rodAnchor = { x: 0, y: 0 };
window.baseX = 0;

window.environmentState = {
  tileWidth: 40,
  tileHeight: 40,
  landRows: 3,
  sources: {},
  water: null,
  shore: null,
  land: null
};

window.characterSprite = {
  image: null,
  spriteSource: null,
  frameWidth: 40,
  frameHeight: 40,
  frameCount: 4,
  currentFrame: 0,
  idleFrame: 0,
  postCastFrame: 3,
  castSequence: [0, 1, 2, 3],
  frameDuration: 0.12,
  scale: 2.4,
  lineAnchor: { x: 30, y: 18 },
  playing: false,
  animationIndex: 0,
  timer: 0,
  holdFrame: 3
};

window.globalTime = 0;
window.latestMetrics = null;

