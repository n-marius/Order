// Vorlage: Snacks und Desserts. Wird über Einstellungen → „Vorlage importieren“ in die Küche übernommen.
// Feste IDs: ein erneuter Import legt nichts doppelt an. Vorhandene Zutaten gleichen Namens werden wiederverwendet.
// tpl: Version eines Vorlagengerichts. Ist ein importiertes Gericht älter und seither unverändert, aktualisiert
// ein erneuter Import es (Fotos, Vorrat, Ausblenden und Sortierung bleiben erhalten). PREVIOUS enthält die
// abweichenden Felder früherer Versionen, um „unverändert“ erkennen zu können.

const I = (id, name) => ({ id: `vz-${id}`, name });

export const INGREDIENTS = [
  I('walnuss-salami', 'Walnuss-Salami'),
  I('polvorones', 'Polvorones'),
  I('oliven', 'matte Oliven'),
  I('halva', 'Halva'),
  I('himbeeren', 'Himbeeren'),
  I('lakritz-zitrone', 'Lakritz von Bülow Zitrone'),
  I('lakritz-yuzu', 'Lakritz von Bülow Yuzu'),
  I('lakritz-vanille', 'Lakritz von Bülow Vanille'),
  I('pastel', 'Pastel de Nata'),
  I('pralinen', 'Pralinen'),
  I('shortbread', 'Shortbread Kekse'),
  I('brueckentrueffel', 'Brückentrüffel'),
  I('vanilleeis', 'Vanilleeis'),
  I('cookie-dough-eis', 'Cookie-Dough-Eis'),
  I('fallot-senf', 'Fallot-Senf Klassisch'),
  I('fallot-estragon', 'Fallot-Senf Estragon'),
  I('fallot-honig-balsamico', 'Fallot-Senf Honig-Balsamico'),
  I('fallot-trueffel', 'Fallot-Senf Trüffel'),
  I('pistaziencreme', 'Pistaziencreme'),
  I('olivenoel', 'Olivenöl'),
  I('parmesan', 'Parmesan'),
  I('roggenbrot', 'Roggenbrot'),
  I('knoblauch', 'Knoblauch'),
  I('frittieroel', 'Frittieröl'),
  // Getränke
  I('skiwasser', 'Skiwasser'),
  I('tymbark', 'Tymbark'),
  I('fanta-shokata', 'Fanta Shokata'),
  I('kombutscha', 'Kombutscha'),
  I('calypso', 'Calypso'),
  I('san-bitter', 'San Bitter'),
  I('bitter-lemon', 'Bitter Lemon'),
  I('orangensaft', 'Orangensaft'),
  I('mangosaft', 'Mangosaft'),
  I('limettensaft', 'Limettensaft'),
  I('ginger-beer', 'Ginger Beer'),
  I('limette', 'Limette'),
  I('yuzu-limo', 'Yuzu Limo'),
  I('yuzu-limo-light', 'Yuzu Limo light'),
  // Grundrezepte
  I('cannoli-roehren', 'Cannoli-Röhren'),
  I('ricotta', 'Ricotta'),
  I('puderzucker', 'Puderzucker'),
  I('vanillezucker', 'Vanillezucker'),
  I('pistazien', 'Pistazien, gehackt'),
  I('sahne', 'Sahne'),
  I('eigelb', 'Eigelb'),
  I('zucker', 'Zucker'),
  I('brauner-zucker', 'Brauner Zucker'),
  I('vanilleschote', 'Vanilleschote'),
  I('amaretto', 'Amaretto'),
  I('amarettini', 'Amarettini'),
  I('mascarpone', 'Mascarpone'),
  I('joghurt', 'Naturjoghurt'),
  I('zartbitter', 'Zartbitterschokolade'),
  I('butter', 'Butter'),
  I('eier', 'Eier'),
  I('mehl', 'Mehl'),
];

const ing = (id, unit = '', amount = '', amounts = {}) => ({ ingredientId: `vz-${id}`, unit, amount: String(amount), amounts });
// Mengen je Größe: sizes = ['s1','s2',…], werte = [a, b, …]
const per = (id, unit, sizes, values) => ing(id, unit, '', Object.fromEntries(sizes.map((s, i) => [s, String(values[i] ?? '')])));
const sizes = (...names) => names.map((name, i) => ({ id: `s${i + 1}`, name }));
const S3 = ['s1', 's2', 's3'];
const S2 = ['s1', 's2'];
const SCHALEN = () => sizes('Schälchen', 'Schale', 'Schüssel');

const EISSORTE = {
  id: 'o-eis', name: 'Eissorte', type: 'single', required: true,
  choices: [
    { id: 'c-vanille', name: 'Vanille', ingredientId: 'vz-vanilleeis', default: true },
    { id: 'c-cookie', name: 'Cookie Dough', ingredientId: 'vz-cookie-dough-eis', default: false },
  ],
};

const D = (id, o) => ({
  id: `vd-${id}`, tpl: 1, country: '', description: '', imageId: null, prepMinutes: 5,
  sizes: [], defaultSizeId: null, ingredients: [], steps: [], options: [], ice: null, hidden: false,
  ...o,
  ...(o.sizes?.length ? { defaultSizeId: o.sizes[0].id } : {}),
});

export const DISHES = [
  // ---------- herzhaft ----------
  D('walnuss-salami', {
    name: 'Walnuss-Salami', category: 'vorspeise', country: 'IT', sort: 10, tpl: 2,
    sizes: sizes('5 Scheiben', '10 Scheiben', '20 Scheiben'),
    ingredients: [per('walnuss-salami', 'Scheiben', S3, [5, 10, 20])],
    options: [{ id: 'o-dazu', name: 'Fallot-Senf', type: 'multi', required: false, choices: [
      { id: 'c-senf', name: 'Klassisch', ingredientId: 'vz-fallot-senf', default: false },
      { id: 'c-senf-estragon', name: 'Estragon', ingredientId: 'vz-fallot-estragon', default: false },
      { id: 'c-senf-honig-balsamico', name: 'Honig-Balsamico', ingredientId: 'vz-fallot-honig-balsamico', default: false },
      { id: 'c-senf-trueffel', name: 'Trüffel', ingredientId: 'vz-fallot-trueffel', default: false },
    ] }],
  }),
  D('oliven', {
    name: 'matte Oliven', category: 'vorspeise', country: 'ES', sort: 20,
    sizes: SCHALEN(), ingredients: [ing('oliven')],
  }),
  D('parmesan', {
    name: 'Parmesanbrocken', category: 'vorspeise', country: 'IT', sort: 30,
    sizes: sizes('Schälchen', 'Schale'), ingredients: [ing('parmesan')],
  }),
  D('kepta-duona', {
    name: 'Kepta duona', category: 'vorspeise', country: 'LT', sort: 40, prepMinutes: 15,
    description: 'Frittiertes Roggenbrot mit Knoblauch',
    sizes: sizes('5 Stück', '10 Stück', '15 Stück'),
    ingredients: [per('roggenbrot', 'Stück', S3, [5, 10, 15]), per('knoblauch', 'Zehe', S3, [1, 2, 3]), ing('frittieroel')],
  }),

  // ---------- süß ----------
  D('polvorones', {
    name: 'Polvorones', category: 'dessert', country: 'ES', sort: 10,
    sizes: sizes('1 Stück', '2 Stück', '5 Stück'),
    ingredients: [per('polvorones', 'Stück', S3, [1, 2, 5])],
  }),
  D('halva', {
    name: 'Halva', category: 'dessert', country: 'UA', sort: 20,
    sizes: sizes('Brocken', 'Scheibe'), ingredients: [ing('halva')],
  }),
  D('chocolate-cake', {
    name: 'Chocolate-Cake mit Eis', category: 'dessert', country: 'US', sort: 30, prepMinutes: 35, tpl: 2,
    ingredients: [ing('zartbitter', 'g', 50), ing('butter', 'g', 40), ing('eier', 'Stück', 1), ing('zucker', 'g', 25), ing('mehl', 'g', 15)],
    steps: [
      'Backofen auf 200 °C Ober-/Unterhitze vorheizen, ein ofenfestes Förmchen (ca. 150 ml) buttern und leicht mit Zucker ausstreuen.',
      'Schokolade und Butter über dem Wasserbad oder kurz in der Mikrowelle schmelzen und glatt rühren.',
      'Ei und Zucker schaumig schlagen, Schokoladenmasse einrühren und das Mehl unterheben.',
      'Teig ins Förmchen füllen und 10–12 Minuten backen; der Rand ist fest, der Kern noch weich.',
      'Eine Minute ruhen lassen, auf einen Teller stürzen und mit einer Kugel Eis der gewählten Sorte servieren.',
    ],
    options: [EISSORTE],
  }),
  D('himbeeren-eis', {
    name: 'Himbeeren mit Eis', category: 'dessert', country: 'DE', sort: 40,
    sizes: SCHALEN(), ingredients: [per('himbeeren', 'g', S3, [100, 150, 250])],
    options: [EISSORTE],
  }),
  D('lakritz', {
    name: 'Lakritz von Bülow', category: 'dessert', country: 'DK', sort: 50,
    options: [{ id: 'o-sorte', name: 'Sorte', type: 'single', required: true, choices: [
      { id: 'c-zitrone', name: 'Zitrone', ingredientId: 'vz-lakritz-zitrone', default: false },
      { id: 'c-yuzu', name: 'Yuzu', ingredientId: 'vz-lakritz-yuzu', default: false },
      { id: 'c-vanille', name: 'Vanille', ingredientId: 'vz-lakritz-vanille', default: false },
    ] }],
  }),
  D('pastel', { name: 'Pastel de Nata', category: 'dessert', country: 'PT', sort: 60, ingredients: [ing('pastel', 'Stück', 1)] }),
  D('pralinen', { name: 'Pralinen', category: 'dessert', country: 'BE', sort: 70, ingredients: [ing('pralinen')] }),
  D('shortbread', { name: 'Shortbread Kekse', category: 'dessert', country: 'GB', sort: 80, ingredients: [ing('shortbread')] }),
  D('brueckentrueffel', { name: 'Brückentrüffel', category: 'dessert', country: 'DE', sort: 90, ingredients: [ing('brueckentrueffel')] }),

  // ---------- frisch zubereitet ----------
  D('cannolo', {
    name: 'Cannolo', category: 'dessert', country: 'IT', sort: 100, prepMinutes: 45, tpl: 2,
    ingredients: [ing('cannoli-roehren', 'Stück', 1), ing('ricotta', 'g', 60), ing('puderzucker', 'g', 10), ing('vanillezucker', 'g', 2)],
    steps: [
      'Ricotta in einem feinen Sieb 30 Minuten abtropfen lassen.',
      'Ricotta mit Puderzucker und Vanillezucker glatt rühren und in einen Spritzbeutel füllen.',
      'Die Cannoli-Röhre erst unmittelbar vor dem Servieren von beiden Seiten füllen, damit sie knusprig bleibt.',
      'Sorte Pistazie: beide Enden in gehackte Pistazien tauchen.',
      'Falls gewählt, mit Pistaziencreme beträufeln; mit Puderzucker bestäuben.',
    ],
    options: [
      { id: 'o-sorte', name: 'Sorte', type: 'single', required: true, choices: [
        { id: 'c-pistazie', name: 'Pistazie', ingredientId: 'vz-pistazien', default: false },
        { id: 'c-pur', name: 'Pur', ingredientId: null, default: false },
      ] },
      { id: 'o-creme', name: 'Dazu', type: 'multi', required: false, choices: [
        { id: 'c-pistaziencreme', name: 'Pistaziencreme', ingredientId: 'vz-pistaziencreme', default: false },
      ] },
    ],
  }),
  D('creme-brulee', {
    name: 'Creme-Brûlée', category: 'dessert', country: 'FR', sort: 110, prepMinutes: 240, tpl: 2,
    sizes: SCHALEN(),
    ingredients: [
      per('sahne', 'ml', S3, [100, 170, 250]),
      per('eigelb', 'Stück', S3, [1, 2, 3]),
      per('zucker', 'g', S3, [15, 25, 40]),
      per('vanilleschote', 'Stück', S3, ['¼', '⅓', '½']),
      per('brauner-zucker', 'g', S3, [8, 10, 15]),
    ],
    steps: [
      'Backofen auf 150 °C Ober-/Unterhitze vorheizen.',
      'Vanilleschote auskratzen; Sahne mit Mark und Schote aufkochen, vom Herd nehmen und 10 Minuten ziehen lassen, dann die Schote entfernen.',
      'Eigelb mit dem Zucker verrühren (nicht schaumig schlagen) und die warme Sahne langsam unterrühren.',
      'Masse in ofenfeste Förmchen füllen und im Wasserbad 35–45 Minuten (Schüssel bis 50 Minuten) stocken lassen; die Mitte darf noch leicht wackeln.',
      'Abkühlen lassen und mindestens 2 Stunden kühl stellen.',
      'Vor dem Servieren gleichmäßig mit braunem Zucker bestreuen und mit dem Brenner karamellisieren.',
    ],
  }),
  D('amaretto-ricotta', {
    name: 'Amaretto-Ricotta', category: 'dessert', country: 'IT', sort: 120, prepMinutes: 10,
    sizes: SCHALEN(),
    ingredients: [
      per('ricotta', 'g', S3, [100, 150, 250]),
      per('puderzucker', 'g', S3, [10, 15, 25]),
      per('amaretto', 'ml', S3, [10, 15, 25]),
      per('amarettini', 'Stück', S3, [3, 5, 8]),
    ],
    steps: [
      'Ricotta mit Puderzucker und Amaretto cremig rühren.',
      'Amarettini grob zerbröseln.',
      'Ricottacreme und Amarettini abwechselnd in das Gefäß schichten und mit Amarettini abschließen.',
      'Sofort servieren oder bis zu 30 Minuten kühl stellen.',
    ],
  }),
  D('himbeer-mascarpone', {
    name: 'Himbeer-Mascarpone', category: 'dessert', country: 'IT', sort: 130, prepMinutes: 10,
    sizes: sizes('Gläschen', 'Glas'),
    ingredients: [
      per('mascarpone', 'g', S2, [50, 100]),
      per('joghurt', 'g', S2, [50, 100]),
      per('zucker', 'g', S2, [10, 20]),
      per('vanillezucker', 'g', S2, [2, 4]),
      per('himbeeren', 'g', S2, [60, 120]),
    ],
    steps: [
      'Mascarpone mit Joghurt, Zucker und Vanillezucker glatt rühren.',
      'Die Hälfte der Himbeeren mit einer Gabel leicht zerdrücken.',
      'Creme und zerdrückte Himbeeren abwechselnd ins Glas schichten.',
      'Mit ganzen Himbeeren abschließen.',
    ],
  }),

  // ---------- Getränke (alkoholfrei) ----------
  ...[
    ['skiwasser', 'Skiwasser', 'AT'],
    ['tymbark', 'Tymbark', 'PL', 2],
    ['fanta-shokata', 'Fanta Shokata', '', 2],
    ['kombutscha', 'Kombutscha', 'MX'],
    ['calypso', 'Calypso', 'US'],
  ].map(([id, name, country, tpl = 1], i) => D(id, {
    name, category: 'getraenk', country, sort: 10 + i * 10, tpl, ice: { default: false }, ingredients: [ing(id)],
  })),
  D('san-bitter', {
    name: 'San Bitter', category: 'getraenk', country: 'IT', sort: 60, ice: { default: false },
    ingredients: [ing('san-bitter', 'ml', 100)],
  }),
  D('san-bitter-bitter-lemon-orangensaft', {
    name: 'San Bitter - Bitter Lemon - Orangensaft', category: 'getraenk', country: 'IT', sort: 70, ice: { default: false },
    ingredients: [ing('san-bitter', 'ml', 100), ing('bitter-lemon', 'ml', 75), ing('orangensaft', 'ml', 75)],
    steps: ['San Bitter ins Glas geben, mit Bitter Lemon und Orangensaft auf 250 ml auffüllen.'],
  }),
  D('san-bitter-bitter-lemon', {
    name: 'San Bitter - Bitter Lemon', category: 'getraenk', country: 'IT', sort: 80, ice: { default: false },
    ingredients: [ing('san-bitter', 'ml', 100), ing('bitter-lemon', 'ml', 150)],
    steps: ['San Bitter ins Glas geben, mit Bitter Lemon auf 250 ml auffüllen.'],
  }),
  D('mango-mule', {
    name: 'Mango Mule', category: 'getraenk', sort: 90, ice: { default: true },
    ingredients: [ing('mangosaft', 'ml', 80), ing('limettensaft', 'ml', 10), ing('ginger-beer', 'ml', 120), ing('limette', 'Scheibe', 1)],
    steps: [
      'Mangosaft und Limettensaft ins Glas geben.',
      'Bei Auswahl „mit Eis“ das Glas mit Eiswürfeln füllen.',
      'Mit Ginger Beer auffüllen, kurz umrühren und mit einer Limettenscheibe garnieren.',
    ],
  }),
  ...[['yuzu-limo', 'Yuzu Limo'], ['yuzu-limo-light', 'Yuzu Limo light']].map(([id, name], i) => D(id, {
    name, category: 'getraenk', country: 'JP', sort: 100 + i * 10,
    sizes: sizes('Glas', 'Flasche'), ingredients: [ing(id)],
    options: [{ id: 'o-glas', name: 'Dazu', type: 'multi', required: false, sizeIds: ['s2'], choices: [
      { id: 'c-glas', name: 'mit Glas', ingredientId: null, default: true },
    ] }],
  })),
];

/** Zutaten, deren Name sich gegenüber früheren Vorlagen geändert hat: id → alter Name. */
export const RENAMED_INGREDIENTS = {
  'vz-tymbark': 'Timbark',
};

/** Abweichende Felder früherer Vorlagenversionen (zur Erkennung unveränderter Gerichte). */
export const PREVIOUS = {
  'vd-tymbark': { name: 'Timbark' },
  'vd-fanta-shokata': { country: 'UA' },
  'vd-chocolate-cake': { prepMinutes: 25 },
  'vd-creme-brulee': { prepMinutes: 180 },
  'vd-cannolo': { prepMinutes: 10, steps: [
    'Ricotta in einem feinen Sieb kurz abtropfen lassen.',
    'Ricotta mit Puderzucker und Vanillezucker glatt rühren und in einen Spritzbeutel füllen.',
    'Die Cannoli-Röhre erst unmittelbar vor dem Servieren von beiden Seiten füllen, damit sie knusprig bleibt.',
    'Sorte Pistazie: beide Enden in gehackte Pistazien tauchen.',
    'Falls gewählt, mit Pistaziencreme beträufeln; mit Puderzucker bestäuben.',
  ] },
  'vd-walnuss-salami': {
    options: [{ id: 'o-dazu', name: 'Dazu', type: 'multi', required: false,
      choices: [{ id: 'c-senf', name: 'Fallot-Senf', ingredientId: 'vz-fallot-senf', default: false }] }],
  },
};
