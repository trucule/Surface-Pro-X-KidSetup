// More things to buy in My Avatar: hats, glasses, things for her neck and back, things to hold, outfits, pets, places,
// sparkles, hair dyes, a frame and background for her home screen picture, and colour themes for this app.
//
// window.AVATAR_EXTRAS holds the shop list and prices; avatar.js calls AVATAR_EXTRAS.make(K) with its drawing kit
// (THREE, mesh, mat, limb, shapes, the backdrop) to get a builder for each kind of item. Every builder draws in the same units as
// the drawn avatar: a head of radius R = 0.19, a body whose neck is at height 1.13, and the world in metres-ish.
(function () {
  'use strict';
  // All prices are multiplied by this, so the whole shop can be made cheaper or dearer in one place.
  const PRICE_SCALE = 1;

  const RAINBOW = ['#FF2D55', '#FF9F1C', '#FFD60A', '#38E54D', '#3A86FF', '#9B5DE5'];
    // ----------------------------------------------------------------------------------------------------------
    // The shop. [id, slot, name, emoji, price]
    // ----------------------------------------------------------------------------------------------------------
    const LIST = [
      // Hats
      ['bow', 'hat', 'Big bow', '🎀', 35], ['party', 'hat', 'Party hat', '🥳', 35], ['flowerclip', 'hat', 'Flower clip', '🌼', 35],
      ['cap', 'hat', 'Ball cap', '🧢', 40], ['beanie', 'hat', 'Beanie', '🧶', 40], ['bucket', 'hat', 'Bucket hat', '👒', 40],
      ['beret', 'hat', 'Beret', '🎨', 45], ['sunhat', 'hat', 'Sun hat', '👒', 50], ['bearears', 'hat', 'Bear ears', '🐻', 50],
      ['mouseears', 'hat', 'Mouse ears', '🐭', 50], ['foxears', 'hat', 'Fox ears', '🦊', 55], ['catears', 'hat', 'Cat ears', '🐱', 60],
      ['bunnyears', 'hat', 'Bunny ears', '🐰', 60], ['pirate', 'hat', 'Pirate hat', '🏴‍☠️', 60], ['frog', 'hat', 'Frog hat', '🐸', 65],
      ['cowboy', 'hat', 'Cowboy hat', '🤠', 70], ['reindeer', 'hat', 'Reindeer antlers', '🦌', 70], ['propeller', 'hat', 'Propeller cap', '🚁', 75],
      ['tophat', 'hat', 'Top hat', '🎩', 80], ['graduation', 'hat', 'Graduation cap', '🎓', 85], ['flowers', 'hat', 'Flower crown', '🌸', 90],
      ['viking', 'hat', 'Viking helmet', '⚔️', 90], ['jester', 'hat', 'Jester hat', '🃏', 95], ['headphones', 'hat', 'Headphones', '🎧', 110],
      ['wizard', 'hat', 'Wizard hat', '🧙', 150], ['halo', 'hat', 'Halo', '😇', 150], ['unicorn', 'hat', 'Unicorn horn', '🦄', 180],
      ['knight', 'hat', 'Knight helmet', '🛡️', 180], ['tiara', 'hat', 'Tiara', '💎', 250], ['starcrown', 'hat', 'Star crown', '🌟', 300],
      ['crown', 'hat', 'Crown', '👑', 400],
      // Fun glasses
      ['visor', 'shades', 'Sun visor', '🧢', 45], ['sunglasses', 'shades', 'Sunglasses', '🕶️', 50], ['swimgoggles', 'shades', 'Swim goggles', '🏊', 50],
      ['pinkshades', 'shades', 'Pink shades', '💗', 55], ['eyemask', 'shades', 'Hero mask', '🦹', 65], ['heartglasses', 'shades', 'Heart glasses', '😍', 70],
      ['starglasses', 'shades', 'Star glasses', '🤩', 70], ['aviators', 'shades', 'Aviators', '😎', 90], ['butterflyglasses', 'shades', 'Butterfly glasses', '🦋', 110],
      ['rainbowglasses', 'shades', 'Rainbow glasses', '🌈', 120], ['monocle', 'shades', 'Monocle', '🧐', 140],
      // Around her neck
      ['bowtie', 'neck', 'Bow tie', '🎀', 35], ['bandana', 'neck', 'Bandana', '🤠', 40], ['scarf', 'neck', 'Cozy scarf', '🧣', 45],
      ['tie', 'neck', 'Tie', '👔', 45], ['beads', 'neck', 'Friendship beads', '📿', 50], ['lei', 'neck', 'Flower lei', '🌺', 60],
      ['rainbowscarf', 'neck', 'Rainbow scarf', '🌈', 70], ['necklace', 'neck', 'Pearl necklace', '📿', 80], ['locket', 'neck', 'Heart locket', '💖', 90],
      ['medal', 'neck', 'Gold medal', '🥇', 100], ['starnecklace', 'neck', 'Star necklace', '⭐', 120], ['crystal', 'neck', 'Crystal pendant', '🔮', 220],
      // On her back
      ['backpack', 'back', 'Backpack', '🎒', 60], ['turtleshell', 'back', 'Turtle shell', '🐢', 90], ['beewings', 'back', 'Bee wings', '🐝', 100],
      ['ladybug', 'back', 'Ladybug wings', '🐞', 110], ['cape', 'back', 'Hero cape', '🦸', 120], ['balloons', 'back', 'Balloon bunch', '🎈', 120],
      ['guitar', 'back', 'Guitar', '🎸', 160], ['batwings', 'back', 'Bat wings', '🦇', 180], ['fairy', 'back', 'Fairy wings', '🧚', 200],
      ['butterfly', 'back', 'Butterfly wings', '🦋', 220], ['jetpack', 'back', 'Jet pack', '🚀', 300], ['dragonwings', 'back', 'Dragon wings', '🐲', 350],
      ['angel', 'back', 'Angel wings', '👼', 400], ['unicornwings', 'back', 'Unicorn wings', '🦄', 450], ['rainbowwings', 'back', 'Rainbow wings', '🌈', 600],
      ['phoenix', 'back', 'Phoenix wings', '🔥', 800],
      // In her hand
      ['lollipop', 'hold', 'Lollipop', '🍭', 30], ['icecream', 'hold', 'Ice cream', '🍦', 35], ['balloon', 'hold', 'Balloon', '🎈', 40],
      ['book', 'hold', 'Book', '📖', 40], ['sunflower', 'hold', 'Sunflower', '🌻', 45], ['paintbrush', 'hold', 'Paintbrush', '🖌️', 45],
      ['magnifier', 'hold', 'Magnifying glass', '🔍', 55], ['bubblewand', 'hold', 'Bubble wand', '🫧', 60], ['umbrella', 'hold', 'Umbrella', '☂️', 70],
      ['microphone', 'hold', 'Microphone', '🎤', 75], ['wand', 'hold', 'Magic wand', '🪄', 80], ['foamsword', 'hold', 'Foam sword', '🗡️', 85],
      ['teddy', 'hold', 'Teddy bear', '🧸', 90], ['lantern', 'hold', 'Lantern', '🏮', 100], ['trophy', 'hold', 'Trophy', '🏆', 250],
      // Outfits
      ['pajamas', 'outfit', 'Pajamas', '🌙', 120], ['soccer', 'outfit', 'Soccer kit', '⚽', 150], ['chef', 'outfit', 'Chef', '👩‍🍳', 150],
      ['doctor', 'outfit', 'Doctor', '🩺', 150], ['ballerina', 'outfit', 'Ballerina', '🩰', 200], ['cowkid', 'outfit', 'Cowpoke', '🤠', 220],
      ['scientist', 'outfit', 'Scientist', '🔬', 220], ['pirateoutfit', 'outfit', 'Pirate', '🏴‍☠️', 250], ['ninja', 'outfit', 'Ninja', '🥷', 260],
      ['firefighter', 'outfit', 'Firefighter', '🚒', 280], ['superhero', 'outfit', 'Superhero', '⚡', 300], ['wizardkid', 'outfit', 'Wizard', '🧙', 300],
      ['rockstar', 'outfit', 'Rock star', '🎸', 350], ['fairykid', 'outfit', 'Fairy', '🧚', 380], ['princess', 'outfit', 'Princess gown', '👸', 400],
      ['knightoutfit', 'outfit', 'Knight', '🛡️', 450], ['astronaut', 'outfit', 'Astronaut', '🧑‍🚀', 500], ['mermaid', 'outfit', 'Sea princess', '🧜', 500],
      // Pets
      ['fishbowl', 'pet', 'Goldfish', '🐠', 70], ['frogpet', 'pet', 'Frog', '🐸', 75], ['hamster', 'pet', 'Hamster', '🐹', 80],
      ['turtle', 'pet', 'Turtle', '🐢', 90], ['cat', 'pet', 'Kitten', '🐈', 120], ['dog', 'pet', 'Puppy', '🐕', 120], ['bunny', 'pet', 'Bunny', '🐇', 120],
      ['parrot', 'pet', 'Parrot', '🦜', 140], ['dalmatian', 'pet', 'Spotty puppy', '🐶', 140], ['penguin', 'pet', 'Penguin', '🐧', 150],
      ['fox', 'pet', 'Fox', '🦊', 160], ['owl', 'pet', 'Owl', '🦉', 160], ['panda', 'pet', 'Panda', '🐼', 250], ['lioncub', 'pet', 'Lion cub', '🦁', 300],
      ['dragon', 'pet', 'Baby dragon', '🐉', 600], ['unicornpet', 'pet', 'Baby unicorn', '🦄', 700],
      // Places
      ['bedroom', 'place', 'My room', '🛏️', 60], ['park', 'place', 'Park', '🌳', 80], ['beach', 'place', 'Beach', '🏖️', 80],
      ['desert', 'place', 'Desert', '🏜️', 100], ['artstudio', 'place', 'Art studio', '🎨', 100], ['farm', 'place', 'Farm', '🚜', 110],
      ['snow', 'place', 'Snowy day', '❄️', 120], ['city', 'place', 'City', '🏙️', 120], ['jungle', 'place', 'Jungle', '🌴', 130],
      ['nightsky', 'place', 'Night sky', '🌙', 140], ['castle', 'place', 'Castle', '🏰', 150], ['space', 'place', 'Space', '🚀', 150],
      ['underwater', 'place', 'Under the sea', '🐠', 150], ['sunset', 'place', 'Sunset', '🌅', 160], ['rainbow', 'place', 'Rainbow hill', '🌈', 200],
      ['volcano', 'place', 'Volcano island', '🌋', 220], ['stage', 'place', 'Big stage', '🎤', 250], ['candyland', 'place', 'Candy land', '🍬', 300],
      ['clouds', 'place', 'Cloud kingdom', '☁️', 350], ['icecastle', 'place', 'Ice palace', '🧊', 400],
      // Sparkles
      ['glitter', 'sparkle', 'Glitter', '✨', 60], ['hearts', 'sparkle', 'Hearts', '💖', 60], ['bubbles', 'sparkle', 'Bubbles', '🫧', 60],
      ['leaves', 'sparkle', 'Falling leaves', '🍂', 70], ['stars', 'sparkle', 'Star ring', '🌟', 80], ['snowflakes', 'sparkle', 'Snowflakes', '❄️', 80],
      ['notes', 'sparkle', 'Music notes', '🎵', 90], ['petals', 'sparkle', 'Flower petals', '🌸', 90], ['confetti', 'sparkle', 'Confetti', '🎊', 100],
      ['fireflies', 'sparkle', 'Fireflies', '✨', 110], ['butterflies', 'sparkle', 'Butterflies', '🦋', 120], ['rainbowring', 'sparkle', 'Rainbow rings', '🌈', 200],
      // Her home screen picture: background and frame
      ['bg-sky', 'badgebg', 'Blue sky', '🩵', 50], ['bg-mint', 'badgebg', 'Mint', '💚', 50], ['bg-sunset', 'badgebg', 'Sunset', '🌅', 60],
      ['bg-polka', 'badgebg', 'Polka dots', '🔴', 80], ['bg-ocean', 'badgebg', 'Ocean', '🌊', 80], ['bg-candy', 'badgebg', 'Candy stripes', '🍬', 90],
      ['bg-rainbow', 'badgebg', 'Rainbow', '🌈', 120], ['bg-galaxy', 'badgebg', 'Galaxy', '🌌', 150],
      ['fr-sunshine', 'frame', 'Sunshine frame', '☀️', 100], ['fr-gold', 'frame', 'Gold frame', '🥇', 100], ['fr-stars', 'frame', 'Star frame', '⭐', 120],
      ['fr-hearts', 'frame', 'Heart frame', '💗', 120], ['fr-flowers', 'frame', 'Flower frame', '🌸', 120], ['fr-rainbow', 'frame', 'Rainbow frame', '🌈', 150],
      ['fr-galaxy', 'frame', 'Galaxy frame', '🌌', 250], ['fr-crystal', 'frame', 'Crystal frame', '💎', 300],
      // Colours for this app
      ['th-ocean', 'theme', 'Ocean', '🌊', 80], ['th-forest', 'theme', 'Forest', '🌲', 80], ['th-candy', 'theme', 'Candy', '🍭', 100],
      ['th-sunset', 'theme', 'Sunset', '🌅', 100], ['th-midnight', 'theme', 'Midnight', '🌙', 120], ['th-galaxy', 'theme', 'Galaxy', '🌌', 150],
      ['th-pastel', 'theme', 'Unicorn pastel', '🦄', 150], ['th-rainbow', 'theme', 'Rainbow', '🌈', 200],
    ];
    const DYES = { '#FF6FB5': ['Pink hair', 40], '#9B5DE5': ['Purple hair', 40], '#3A86FF': ['Blue hair', 40], '#22C5B8': ['Teal hair', 40],
      '#E53935': ['Red hair', 40], '#FF8C1A': ['Orange hair', 40], '#7CE0B5': ['Mint hair', 50], '#C9A7F5': ['Lavender hair', 50],
      '#FF7A6B': ['Coral hair', 50], '#9BE34B': ['Lime hair', 50], '#1F2E6B': ['Midnight blue hair', 60], '#C8CCD8': ['Silver hair', 120], '#E8B830': ['Gold hair', 120] };
    const SHOP = LIST.map(([id, slot, name, e, price]) => ({ id, slot, name, e, price: Math.round(price * PRICE_SCALE) }));
    Object.entries(DYES).forEach(([c, [n, p]]) => SHOP.push({ id: 'dye' + c.slice(1).toLowerCase(), slot: 'dye', name: n, e: '🎨', price: Math.round(p * PRICE_SCALE), color: c }));

    const OUTFIT_CLOTHES = {
      pajamas: ['top-sweater', '#9EC9FF', 'bottom-pants', '#9EC9FF', 'shoes-flats-bows', null, 'socks-high'],
      cowkid: ['top-polo', '#C0392B', 'bottom-pants', '#3F6FB5', 'shoes-ankle-boots', null, null],
      scientist: ['top-sweater', '#FFFFFF', 'bottom-pants', '#2B2140', 'shoes-sneakers', '#FFFFFF', 'socks-low'],
      pirateoutfit: ['top-tucked-tee', '#FFFFFF', 'bottom-pants', '#2B2140', 'shoes-rain-boots', '#2B2140', null],
      ninja: ['top-sweater', '#1E1E28', 'bottom-pants', '#1E1E28', 'shoes-sneakers', '#1E1E28', null],
      firefighter: ['top-sweater', '#D62828', 'bottom-cargo', '#2B2140', 'shoes-rain-boots', '#2B2140', null],
      wizardkid: ['dress-tunic', '#3A2A8A', null, null, 'shoes-leather', null, null],
      rockstar: ['top-tank', null, 'bottom-pants', '#1E1E28', 'shoes-ankle-boots', null, null],
      fairykid: ['dress-sundress', null, null, null, 'shoes-flats-bows', null, 'socks-frill'],
      knightoutfit: ['top-sweater', '#9A9AA8', 'bottom-pants', '#6B6B78', 'shoes-rain-boots', '#6B6B78', null],
      mermaid: ['dress-tunic', '#22C5B8', null, null, 'shoes-flats-flowers', null, null],
    };
    // What comes with an outfit, worn unless she has chosen her own for that place.
    const OUTFIT_ITEMS = {
      cowkid: { hat: 'cowboy', neck: 'bandana' }, pirateoutfit: { hat: 'pirate', shades: 'eyepatch', hold: 'foamsword' },
      wizardkid: { hat: 'wizard', hold: 'wand' }, rockstar: { shades: 'starglasses', back: 'guitar', hold: 'microphone' },
      fairykid: { back: 'fairy', hold: 'wand', hat: 'flowers' }, knightoutfit: { hat: 'knight', hold: 'foamsword' },
      scientist: { shades: 'labgoggles', hold: 'magnifier' }, ninja: { shades: 'ninjamask' }, pajamas: { hold: 'teddy' },
      mermaid: { neck: 'lei', hat: 'tiara', hold: 'bubblewand' },
    };
    // Colours for this app: header, side bar and panel.
    const THEMES = {
      'th-ocean': { hdr: 'linear-gradient(90deg, #1D6FB8, #22C5B8, #7FD1E8)', nav: '#0E3A5C', navBtn: '#1D5480', card: '#EEF9FF' },
      'th-forest': { hdr: 'linear-gradient(90deg, #2E7D4F, #6FBF4A, #D4E86A)', nav: '#1E3D2A', navBtn: '#2E5A3E', card: '#F2FAEC' },
      'th-candy': { hdr: 'linear-gradient(90deg, #FF8FC8, #FFB3D1, #9EE7FF)', nav: '#7A2A5C', navBtn: '#9A3A75', card: '#FFF0F8' },
      'th-sunset': { hdr: 'linear-gradient(90deg, #FF5E62, #FF9966, #FFD24A)', nav: '#5C2233', navBtn: '#7A3045', card: '#FFF4EA' },
      'th-midnight': { hdr: 'linear-gradient(90deg, #1F2E6B, #3A4FA0, #7B6CC7)', nav: '#0B1340', navBtn: '#1F2A63', card: '#EEF0FF' },
      'th-galaxy': { hdr: 'linear-gradient(90deg, #3A1D7A, #7B2CBF, #E040A0)', nav: '#1A0B2E', navBtn: '#33205A', card: '#F6EEFF' },
      'th-pastel': { hdr: 'linear-gradient(90deg, #FFB3D9, #C9A7F5, #9EE7FF, #B8F2C8)', nav: '#6B5A8A', navBtn: '#8573A8', card: '#FFF7FD' },
      'th-rainbow': { hdr: 'linear-gradient(90deg, #FF2D55, #FF9F1C, #FFD60A, #38E54D, #3A86FF, #9B5DE5)', nav: '#2B2140', navBtn: '#3d3160', card: '#FFFDF4' },
    };

  if (window.REAL_AVATAR && window.REAL_AVATAR.OUTFITS) Object.assign(window.REAL_AVATAR.OUTFITS, OUTFIT_CLOTHES);

  // The builders need avatar.js's drawing kit, so they are made when it is ready.
  function make(K) {
    const { T, mesh, mat, put, limb, SPH, SPH_LO, CYL } = K;
    const V = (x, y, z) => new T.Vector3(x, y, z);
    const glow = (c, k) => mat(c, { emissive: new T.Color(c), emissiveIntensity: k === undefined ? 0.5 : k });
    const clear = (c, o) => new T.MeshStandardMaterial({ color: c, transparent: true, opacity: o, roughness: 0.2, side: T.DoubleSide, depthWrite: false });
    const side = c => new T.MeshStandardMaterial({ color: c, roughness: 0.6, side: T.DoubleSide });
    const cone = (r, h, n) => new T.ConeGeometry(r, h, n || 24);
    const cyl = (a, b, h, n, open) => new T.CylinderGeometry(a, b, h, n || 24, 1, !!open);
    const torus = (r, t, a) => new T.TorusGeometry(r, t, 10, 36, a || Math.PI * 2);
    const box = (x, y, z) => new T.BoxGeometry(x, y, z);
    const shape = pts => { const s = new T.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); return s; };
    const starShape = (r, k) => { const s = new T.Shape(); for (let i = 0; i <= 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * (k || 0.45) : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } return s; };
    const heartShape = r => { const h = new T.Shape(); h.moveTo(0, -r); h.bezierCurveTo(-r * 1.5, 0, -r, r * 1.2, 0, r * 0.5); h.bezierCurveTo(r, r * 1.2, r * 1.5, 0, 0, -r); return h; };
    const flat = (s, m, d) => new T.Mesh(d ? new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }) : new T.ShapeGeometry(s, 24), m);

    // ----------------------------------------------------------------------------------------------------------
    // Hats (g sits on top of the head, like the built-in hats)
    // ----------------------------------------------------------------------------------------------------------
    function hat(g, id, R) {
      const dome = (c, r, y, rough) => g.add(mesh(new T.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, { roughness: rough || 0.7 }), 0, y, 0));
      const ears = (c, inner, shapeFn) => { g.add(mesh(torus(R * 1.04, 0.01, Math.PI), mat('#2B2140'), 0, -R * 0.2, 0)); for (const s of [-1, 1]) shapeFn(s, mat(c), inner && mat(inner)); };
      switch (id) {
        case 'flowerclip': { const c = mat('#FFD60A'); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(mesh(SPH, mat('#ffffff'), R * 0.7 + Math.cos(a) * 0.025, R * 0.15 + Math.sin(a) * 0.025, R * 0.35, 0.02, 0.02, 0.008)); } g.add(mesh(SPH, c, R * 0.7, R * 0.15, R * 0.36, 0.014)); break; }
        case 'bucket': dome('#9EC9FF', R * 1.1, -R * 0.12); g.add(mesh(cyl(R * 1.12, R * 1.45, 0.06, 32, true), side('#9EC9FF'), 0, -R * 0.15, 0)); break;
        case 'beret': g.add(mesh(SPH, mat('#E0303A', { roughness: 0.9 }), -R * 0.1, R * 0.05, 0, R * 1.15, R * 0.35, R * 1.1)); g.add(mesh(CYL, mat('#E0303A'), -R * 0.1, R * 0.4, 0, 0.008, 0.03, 0.008)); break;
        case 'bearears': ears('#8B5A2B', '#D9A577', (s, m, inn) => { g.add(mesh(SPH, m, s * R * 0.7, R * 0.45, 0, 0.055, 0.055, 0.025)); g.add(mesh(SPH, inn, s * R * 0.7, R * 0.45, 0.012, 0.032, 0.032, 0.015)); }); break;
        case 'mouseears': ears('#2B2140', '#FF8FB5', (s, m, inn) => { g.add(mesh(SPH, m, s * R * 0.78, R * 0.55, 0, 0.075, 0.075, 0.015)); g.add(mesh(SPH, inn, s * R * 0.78, R * 0.55, 0.008, 0.05, 0.05, 0.01)); }); break;
        case 'foxears': ears('#FF6B1A', '#ffffff', (s, m, inn) => { const e = mesh(cone(0.05, 0.12, 4), m, s * R * 0.62, R * 0.58, 0); e.rotation.z = -s * 0.35; g.add(e); const i2 = mesh(cone(0.026, 0.07, 4), inn, s * R * 0.62, R * 0.55, 0.018); i2.rotation.z = -s * 0.35; g.add(i2); }); break;
        case 'pirate': { const b = mat('#1E1E28', { roughness: 0.8 }); g.add(mesh(SPH, b, 0, R * 0.02, 0, R * 1.5, R * 0.12, R * 1.1)); g.add(mesh(SPH, b, 0, R * 0.25, 0, R * 1.0, R * 0.45, R * 0.95)); const sk = flat(shape([[-0.025, 0], [0.025, 0], [0, 0.04]]), mat('#ffffff')); sk.position.set(0, R * 0.22, R * 0.98); g.add(sk); g.add(mesh(SPH_LO, mat('#ffffff'), 0, R * 0.3, R * 0.98, 0.022)); break; }
        case 'frog': { dome('#4CC36B', R * 1.12, -R * 0.12, 0.6); for (const s of [-1, 1]) { g.add(mesh(SPH, mat('#4CC36B'), s * R * 0.45, R * 0.95, R * 0.35, 0.06)); g.add(mesh(SPH, mat('#ffffff'), s * R * 0.45, R * 0.98, R * 0.62, 0.035)); g.add(mesh(SPH, mat('#1b1230'), s * R * 0.45, R * 0.99, R * 0.78, 0.018)); } break; }
        case 'cowboy': { const c = mat('#A0652D', { roughness: 0.8 }); const brim = mesh(SPH, c, 0, -R * 0.08, 0, R * 1.8, R * 0.06, R * 1.6); g.add(brim); g.add(mesh(cyl(R * 0.85, R * 1.0, R * 0.8, 32), c, 0, R * 0.3, 0)); g.add(mesh(SPH, c, 0, R * 0.68, 0, R * 0.85, R * 0.2, R * 0.75)); put(g, mesh(torus(R * 0.98, 0.012), mat('#2B2140'), 0, 0, 0, 1, 1, 1)).rotation.x = Math.PI / 2; for (const s of [-1, 1]) g.add(mesh(SPH, c, s * R * 1.55, R * 0.05, 0, R * 0.3, R * 0.12, R * 0.9)); break; }
        case 'reindeer': { g.add(mesh(torus(R * 1.04, 0.01, Math.PI), mat('#2B2140'), 0, -R * 0.2, 0)); const m = mat('#8B5A2B'); for (const s of [-1, 1]) { const b = V(s * R * 0.55, R * 0.4, 0); const t = V(s * R * 1.1, R * 1.6, -0.02); g.add(limb(b, t, 0.014, m)); g.add(limb(V(s * R * 0.75, R * 0.85, 0), V(s * R * 0.4, R * 1.35, 0), 0.011, m)); g.add(limb(V(s * R * 0.95, R * 1.2, 0), V(s * R * 1.5, R * 1.45, 0), 0.01, m)); } g.add(mesh(SPH, mat('#E0303A', { roughness: 0.3 }), 0, -R * 0.72, R * 1.06, 0.026)); break; }
        case 'propeller': { const cols = RAINBOW; for (let i = 0; i < 6; i++) g.add(mesh(new T.SphereGeometry(R * 1.12, 8, 12, i / 6 * Math.PI * 2, Math.PI / 3, 0, Math.PI / 2), mat(cols[i]), 0, -R * 0.1, 0)); const b = mesh(box(0.012, 0.02, 0.012), mat('#2B2140'), 0, R * 1.08, 0); g.add(b); const p = new T.Group(); p.position.set(0, R * 1.15, 0); g.add(p); p.add(mesh(box(0.26, 0.005, 0.03), mat('#FFD60A'))); K.spin(p, 6); break; }
        case 'tophat': { const c = mat('#1E1E28', { roughness: 0.5 }); g.add(mesh(cyl(R * 1.45, R * 1.45, 0.012, 40), c, 0, -R * 0.05, 0)); g.add(mesh(cyl(R * 0.8, R * 0.85, R * 1.6, 32), c, 0, R * 0.75, 0)); g.add(mesh(cyl(R * 0.86, R * 0.86, R * 0.22, 32), mat('#E0303A'), 0, R * 0.12, 0)); break; }
        case 'graduation': { const c = mat('#1E1E28', { roughness: 0.6 }); g.add(mesh(cyl(R * 0.95, R * 1.0, R * 0.4, 32), c, 0, R * 0.05, 0)); const top = mesh(box(R * 2.4, 0.012, R * 2.4), c, 0, R * 0.28, 0); top.rotation.y = Math.PI / 4; g.add(top); g.add(limb(V(0, R * 0.3, 0), V(R * 0.9, R * 0.0, R * 0.6), 0.005, mat('#FFD60A'))); g.add(mesh(CYL, mat('#FFD60A'), R * 0.9, -R * 0.15, R * 0.6, 0.012, 0.06, 0.012)); break; }
        case 'viking': { dome('#9A9AA8', R * 1.12, -R * 0.12, 0.35); put(g, mesh(torus(R * 1.1, 0.02), mat('#8B5A2B'), 0, -R * 0.1, 0)).rotation.x = Math.PI / 2; for (const s of [-1, 1]) { const h = mesh(cone(0.03, 0.16, 16), mat('#FFF3D6'), s * R * 1.15, R * 0.45, 0); h.rotation.z = -s * 0.9; g.add(h); } break; }
        case 'jester': { const cs = ['#E0303A', '#3A86FF', '#FFD60A']; for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.8; const tip = V(Math.sin(a) * R * 1.4, R * 1.0, -R * 0.2 + Math.cos(a) * R * 0.2); g.add(limb(V(Math.sin(a) * R * 0.4, R * 0.3, 0), tip, 0.045, mat(cs[i]))); g.add(mesh(SPH, glow('#FFD60A', 0.3), tip.x, tip.y - 0.02, tip.z, 0.025)); } dome('#7B2CBF', R * 1.1, -R * 0.1); break; }
        case 'headphones': { const c = mat('#FF4F8B', { roughness: 0.35 }); g.add(mesh(torus(R * 1.12, 0.014, Math.PI), c, 0, -R * 0.45, 0)); for (const s of [-1, 1]) { const e = mesh(cyl(0.05, 0.05, 0.035, 24), c, s * R * 1.12, -R * 0.5, 0); e.rotation.z = Math.PI / 2; g.add(e); const p = mesh(cyl(0.035, 0.035, 0.01, 24), mat('#2B2140'), s * R * 1.12 - s * 0.018, -R * 0.5, 0); p.rotation.z = Math.PI / 2; g.add(p); } break; }
        case 'halo': { const h = mesh(torus(R * 0.7, 0.014), glow('#FFE680', 0.9), 0, R * 0.95, -0.01); h.rotation.x = Math.PI / 2; g.add(h); K.bob(h, 0.01, 1.6); break; }
        case 'knight': { const c = mat('#B8BCC8', { roughness: 0.25, metalness: 0.7 }); dome('#B8BCC8', R * 1.15, -R * 0.15, 0.25); g.children[g.children.length - 1].material = c; g.add(mesh(new T.CylinderGeometry(R * 1.15, R * 1.12, R * 0.9, 32, 1, true, Math.PI * 0.3, Math.PI * 1.4), new T.MeshStandardMaterial({ color: '#B8BCC8', roughness: 0.25, metalness: 0.7, side: T.DoubleSide }), 0, -R * 0.6, -R * 0.12)); g.add(limb(V(0, R * 1.05, 0), V(0, R * 1.05, -R * 1.2), 0.04, mat('#E0303A'))); break; }
        case 'starcrown': { const m = glow('#FFD60A', 0.6); for (let i = 0; i < 7; i++) { const a = Math.PI * (0.1 + i * 0.8 / 6); const s = flat(starShape(0.045 - Math.abs(i - 3) * 0.006), m, 0.01); s.position.set(Math.cos(a) * R * 0.95, R * 0.15 + (3 - Math.abs(i - 3)) * 0.012, Math.sin(a) * R * 0.95); s.lookAt(0, s.position.y, 0); s.rotateY(Math.PI); g.add(s); } put(g, mesh(torus(R * 0.95, 0.008, Math.PI), m, 0, 0, 0)).rotation.x = -Math.PI / 2; break; }
      }
    }

    // ----------------------------------------------------------------------------------------------------------
    // Glasses (head frame: eyes at y 0.015, the front of the face at z R * 0.97)
    // ----------------------------------------------------------------------------------------------------------
    function shades(head, id, R) {
      const z = R * 0.97, y = 0.015, frameM = mat('#2B2140', { roughness: 0.3 });
      const arms = m => { for (const s of [-1, 1]) head.add(limb(V(s * 0.11, y + 0.01, z - 0.005), V(s * R * 0.99, y + 0.01, -0.02), 0.004, m || frameM)); };
      const lenses = (geo, m, d) => { for (const s of [-1, 1]) head.add(mesh(geo, m, s * (d || 0.07), y, z)); };
      const round = r => cyl(r, r, 0.006, 32).rotateX(Math.PI / 2);
      switch (id) {
        case 'visor': { const v = mesh(new T.CylinderGeometry(R * 1.0, R * 1.0, 0.04, 40, 1, true, -Math.PI * 0.4, Math.PI * 0.8), new T.MeshStandardMaterial({ color: '#3A86FF', transparent: true, opacity: 0.6, side: T.DoubleSide }), 0, y + 0.045, 0.005); v.rotation.y = 0; head.add(v); break; }
        case 'swimgoggles': lenses(round(0.034), clear('#7FD1E8', 0.7)); for (const s of [-1, 1]) head.add(mesh(torus(0.035, 0.008), mat('#FF4F8B'), s * 0.07, y, z)); head.add(mesh(new T.CylinderGeometry(R * 1.0, R * 1.0, 0.014, 40, 1, true), side('#FF4F8B'), 0, y, -0.01)); break;
        case 'pinkshades': lenses(round(0.04), clear('#FF6FB5', 0.85)); for (const s of [-1, 1]) head.add(mesh(torus(0.041, 0.005), mat('#ffffff'), s * 0.07, y, z)); arms(mat('#ffffff')); break;
        case 'eyemask': { const m = flat(shape([[-0.13, 0.02], [-0.05, 0.05], [0, 0.025], [0.05, 0.05], [0.13, 0.02], [0.1, -0.035], [0.03, -0.03], [0, -0.01], [-0.03, -0.03], [-0.1, -0.035]]), mat('#E0303A'), 0.006); m.position.set(0, y, z - 0.004); head.add(m); for (const s of [-1, 1]) head.add(mesh(SPH, mat('#1b1230'), s * 0.06, y + 0.005, z + 0.004, 0.022, 0.014, 0.004)); break; }
        case 'aviators': { const m = new T.MeshStandardMaterial({ color: '#5a3d20', roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.9 }); for (const s of [-1, 1]) { const l = mesh(SPH, m, s * 0.068, y - 0.004, z, 0.042, 0.035, 0.006); head.add(l); head.add(mesh(torus(0.04, 0.003), mat('#E8B830', { metalness: 0.9, roughness: 0.2 }), s * 0.068, y - 0.004, z, 1.05, 0.88, 1)); } arms(mat('#E8B830', { metalness: 0.9, roughness: 0.2 })); break; }
        case 'butterflyglasses': { for (const s of [-1, 1]) { const w = flat(shape([[0, 0], [0.05, 0.05], [0.09, 0.03], [0.07, -0.01], [0.08, -0.04], [0.03, -0.035]]), clear('#C77DFF', 0.85), 0.005); w.scale.x = s; w.position.set(s * 0.012, y, z); head.add(w); } arms(); break; }
        case 'rainbowglasses': for (const s of [-1, 1]) for (let i = 0; i < 5; i++) head.add(mesh(torus(0.042 - i * 0.006, 0.0035), mat(RAINBOW[i]), s * 0.07, y, z + 0.001 * i)); lenses(round(0.012), clear('#ffffff', 0.4)); arms(); break;
        case 'monocle': head.add(mesh(torus(0.04, 0.005), mat('#E8B830', { metalness: 0.9, roughness: 0.2 }), 0.07, y, z)); head.add(mesh(round(0.038), clear('#ffffff', 0.3), 0.07, y, z)); head.add(limb(V(0.1, y - 0.03, z), V(0.14, -0.15, z * 0.6), 0.002, mat('#E8B830'))); break;
        case 'eyepatch': head.add(mesh(SPH, mat('#1E1E28'), 0.068, y, z + 0.002, 0.035, 0.03, 0.006)); head.add(limb(V(-0.12, y + 0.06, z - 0.03), V(0.14, y - 0.03, z - 0.02), 0.003, mat('#1E1E28'))); break;
        case 'labgoggles': lenses(round(0.04), clear('#BDEFFF', 0.5)); for (const s of [-1, 1]) head.add(mesh(torus(0.041, 0.008), mat('#2B2140'), s * 0.07, y, z)); head.add(mesh(new T.CylinderGeometry(R * 1.0, R * 1.0, 0.014, 40, 1, true), side('#2B2140'), 0, y, -0.01)); break;
        case 'ninjamask': head.add(mesh(new T.CylinderGeometry(R * 1.02, R * 1.02, 0.03, 40, 1, true), side('#1E1E28'), 0, y + 0.045, 0)); for (const s of [-1, 1]) head.add(limb(V(0, y + 0.045, -R), V(s * 0.04, y - 0.05, -R * 1.25), 0.008, mat('#1E1E28'))); break;
      }
    }

    // ----------------------------------------------------------------------------------------------------------
    // Around her neck (body frame: neck at y 1.1, front of the chest at z 0.11)
    // ----------------------------------------------------------------------------------------------------------
    function neck(body, id) {
      const ring = (n, f) => { for (let i = 0; i < n; i++) { const a = Math.PI * 0.1 + i / (n - 1) * Math.PI * 0.8; f(i, Math.cos(a) * 0.085, 1.09 - Math.sin(a) * 0.055, Math.sin(a) * 0.07 + 0.02); } };
      switch (id) {
        case 'bandana': { const m = side('#E0303A'); put(body, mesh(torus(0.072, 0.014), m, 0, 1.11, 0.0, 1, 1, 0.85)).rotation.x = Math.PI / 2; const t = flat(shape([[-0.07, 0], [0.07, 0], [0, -0.09]]), m); t.position.set(0, 1.1, 0.1); t.rotation.x = -0.25; body.add(t); break; }
        case 'tie': { body.add(mesh(SPH, mat('#3A86FF'), 0, 1.08, 0.1, 0.018, 0.014, 0.01)); const t = flat(shape([[-0.015, 0], [0.015, 0], [0.025, -0.16], [0, -0.19], [-0.025, -0.16]]), mat('#3A86FF'), 0.005); t.position.set(0, 1.07, 0.105); t.rotation.x = -0.15; body.add(t); break; }
        case 'beads': ring(14, (i, x, y, z) => body.add(mesh(SPH_LO, mat(RAINBOW[i % 6], { roughness: 0.3 }), x, y, z, 0.012))); break;
        case 'lei': ring(16, (i, x, y, z) => { for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; body.add(mesh(SPH_LO, mat(['#FF4F8B', '#FFD60A', '#ffffff', '#FF9F1C'][i % 4]), x + Math.cos(a) * 0.01, y + Math.sin(a) * 0.01, z + 0.006, 0.009)); } }); break;
        case 'rainbowscarf': for (let i = 0; i < 6; i++) put(body, mesh(torus(0.075, 0.006), mat(RAINBOW[i], { roughness: 0.95 }), 0, 1.08 + i * 0.01, 0, 1, 1, 0.9)).rotation.x = Math.PI / 2; for (let i = 0; i < 6; i++) body.add(mesh(box(0.01, 0.2, 0.025), mat(RAINBOW[i], { roughness: 0.95 }), 0.025 + i * 0.01, 0.98, 0.11)); break;
        case 'locket': ring(18, (i, x, y, z) => body.add(mesh(SPH_LO, mat('#E8B830', { metalness: 0.8, roughness: 0.25 }), x, y, z, 0.004))); { const h = flat(heartShape(0.02), mat('#FF2D78', { metalness: 0.5, roughness: 0.2 }), 0.008); h.position.set(0, 1.02, 0.1); body.add(h); } break;
        case 'starnecklace': ring(18, (i, x, y, z) => body.add(mesh(SPH_LO, mat('#E8E8F0', { metalness: 0.8, roughness: 0.2 }), x, y, z, 0.004))); { const s = flat(starShape(0.03), glow('#FFD60A', 0.4), 0.008); s.position.set(0, 1.01, 0.1); body.add(s); } break;
        case 'crystal': ring(18, (i, x, y, z) => body.add(mesh(SPH_LO, mat('#E8E8F0', { metalness: 0.8, roughness: 0.2 }), x, y, z, 0.004))); { const c = mesh(new T.OctahedronGeometry(0.028), new T.MeshPhysicalMaterial({ color: '#C77DFF', roughness: 0.05, metalness: 0.1, transmission: 0.3, emissive: new T.Color('#7B2CBF'), emissiveIntensity: 0.4 }), 0, 1.0, 0.11, 0.8, 1.3, 0.8); body.add(c); K.spin(c, 1); } break;
      }
    }

    // ----------------------------------------------------------------------------------------------------------
    // On her back (g sits between her shoulder blades)
    // ----------------------------------------------------------------------------------------------------------
    function back(g, id, parts) {
      const wings = (sh, m, rot, flap) => { for (const s of [-1, 1]) { const w = new T.Mesh(new T.ShapeGeometry(sh, 24), m); w.scale.x = s; w.rotation.y = s * (rot || 0.45); w.position.x = s * 0.02; g.add(w); if (flap !== false) parts['wing' + s] = w; } };
      const wingM = (c, o, e) => new T.MeshStandardMaterial({ color: c, transparent: true, opacity: o, side: T.DoubleSide, roughness: 0.3, emissive: new T.Color(c), emissiveIntensity: e === undefined ? 0.15 : e, depthWrite: false });
      const featherShape = () => { const s = new T.Shape(); s.moveTo(0, 0); for (let i = 0; i <= 6; i++) s.quadraticCurveTo(0.12 + i * 0.05, 0.35 - i * 0.06, 0.08 + i * 0.055, 0.25 - i * 0.07); s.lineTo(0, -0.05); return s; };
      switch (id) {
        case 'turtleshell': g.add(mesh(SPH, mat('#4C9A2A', { roughness: 0.7 }), 0, -0.05, -0.03, 0.2, 0.24, 0.1)); for (const [x, y] of [[0, 0], [0.09, 0.07], [-0.09, 0.07], [0.09, -0.1], [-0.09, -0.1], [0, -0.17], [0, 0.14]]) g.add(mesh(SPH, mat('#2E6B1A', { roughness: 0.7 }), x, y - 0.05, -0.1, 0.05, 0.05, 0.02)); break;
        case 'beewings': wings((() => { const s = new T.Shape(); s.absellipse(0.13, 0.08, 0.14, 0.07, 0, Math.PI * 2, false, 0.5); return s; })(), wingM('#E6F7FF', 0.55)); break;
        case 'ladybug': for (const s of [-1, 1]) { const w = mesh(SPH, mat('#E0303A', { roughness: 0.35 }), s * 0.075, -0.05, -0.07, 0.085, 0.16, 0.035); w.rotation.z = s * 0.22; g.add(w); for (let i = 0; i < 3; i++) g.add(mesh(SPH_LO, mat('#1b1230'), s * (0.06 + (i % 2) * 0.035), 0.03 - i * 0.065, -0.1, 0.018, 0.018, 0.008)); } g.add(mesh(box(0.006, 0.3, 0.01), mat('#1b1230'), 0, -0.05, -0.1)); break;
        case 'balloons': for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, p = V(Math.cos(a) * 0.14, 0.32 + Math.sin(a * 2) * 0.04 + (i % 2) * 0.07, -0.16 + Math.sin(a) * 0.08); g.add(limb(V(0, 0, -0.05), p, 0.0025, mat('#ffffff'))); const b = mesh(SPH, mat(RAINBOW[i], { roughness: 0.2 }), p.x, p.y + 0.08, p.z, 0.075, 0.09, 0.075); g.add(b); K.bob(b, 0.012, 1 + i * 0.2); } break;
        case 'guitar': { const gg = new T.Group(); gg.position.set(0, -0.05, -0.08); gg.rotation.z = 0.6; g.add(gg); gg.add(mesh(SPH, mat('#E0303A', { roughness: 0.3 }), 0, -0.12, 0, 0.13, 0.15, 0.04)); gg.add(mesh(SPH, mat('#E0303A', { roughness: 0.3 }), 0, 0.04, 0, 0.1, 0.1, 0.04)); gg.add(mesh(box(0.035, 0.35, 0.02), mat('#5a3d20'), 0, 0.27, 0)); put(gg, mesh(CYL, mat('#1b1230'), 0, -0.05, -0.04, 0.035, 0.005, 0.035)).rotation.x = Math.PI / 2; g.add(limb(V(-0.12, 0.18, 0.08), V(0.13, -0.2, 0.08), 0.008, mat('#2B2140'))); break; }
        case 'batwings': { const s = shape([[0, 0], [0.12, 0.25], [0.38, 0.3], [0.33, 0.18], [0.4, 0.06], [0.3, 0.04], [0.28, -0.07], [0.17, -0.02], [0.12, -0.12]]); wings(s, wingM('#3D2A5C', 0.95, 0.05), 0.5); break; }
        case 'jetpack': { const m = mat('#C0C8D8', { metalness: 0.7, roughness: 0.25 }); for (const s of [-1, 1]) { g.add(mesh(cyl(0.05, 0.05, 0.26, 24), m, s * 0.06, -0.05, -0.05)); g.add(mesh(cone(0.05, 0.08, 24), mat('#E0303A'), s * 0.06, 0.12, -0.05)); const f = mesh(cone(0.035, 0.18, 16), glow('#FF9F1C', 1), s * 0.06, -0.28, -0.05); f.rotation.x = Math.PI; g.add(f); K.flicker(f); } g.add(mesh(box(0.1, 0.18, 0.04), mat('#3A86FF'), 0, -0.04, -0.02)); break; }
        case 'unicornwings': { const sh = featherShape(); const cols = ['#FFB3D9', '#C9A7F5', '#9EE7FF']; for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const w = new T.Mesh(new T.ShapeGeometry(sh, 16), wingM(cols[i], 0.9, 0.25)); w.scale.set(s * (1 - i * 0.18), 1 - i * 0.18, 1); w.position.set(s * 0.02, -i * 0.03, -0.002 * i); w.rotation.y = s * 0.4; g.add(w); if (i === 0) parts['wing' + s] = w; } break; }
        case 'rainbowwings': { const sh = featherShape(); for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const w = new T.Mesh(new T.ShapeGeometry(sh, 16), wingM(RAINBOW[i], 0.95, 0.3)); const k = 1.15 - i * 0.12; w.scale.set(s * k, k, 1); w.position.set(s * 0.02, -i * 0.012, -0.002 * i); w.rotation.y = s * 0.4; g.add(w); if (i === 0) parts['wing' + s] = w; } break; }
        case 'phoenix': { const sh = featherShape(); const cols = ['#FF2D00', '#FF7A00', '#FFC300']; for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const w = new T.Mesh(new T.ShapeGeometry(sh, 16), wingM(cols[i], 0.95, 0.8)); const k = 1.35 - i * 0.25; w.scale.set(s * k, k, 1); w.position.set(s * 0.02, -i * 0.02, -0.002 * i); w.rotation.y = s * 0.35; g.add(w); if (i === 0) parts['wing' + s] = w; } for (let i = 0; i < 3; i++) { const t = mesh(cone(0.03, 0.4, 12), wingM(cols[i], 0.9, 0.8), (i - 1) * 0.04, -0.45, -0.06); t.rotation.x = Math.PI; g.add(t); } break; }
      }
    }

    // ----------------------------------------------------------------------------------------------------------
    // In her hand (hand frame: the palm at the origin, +y up, about the drawn head's units)
    // ----------------------------------------------------------------------------------------------------------
    function hold(h, id) {
      const stick = (len, c, r) => h.add(limb(V(0, -0.04, 0), V(0, len, 0), r || 0.008, mat(c || '#8B5A2B')));
      switch (id) {
        case 'lollipop': stick(0.16, '#ffffff', 0.006); { const l = new T.Mesh(cyl(0.06, 0.06, 0.015, 32), mat('#FF4F8B', { roughness: 0.2 })); l.position.y = 0.21; l.rotation.x = Math.PI / 2; h.add(l); for (let i = 0; i < 3; i++) { const r = mesh(torus(0.045 - i * 0.015, 0.006), mat('#ffffff'), 0, 0.21, 0.009); h.add(r); } } break;
        case 'icecream': put(h, mesh(cone(0.04, 0.12, 20), mat('#D9A066'), 0, 0.0, 0)).rotation.x = Math.PI; for (const [y, c] of [[0.08, '#FFB3D1'], [0.13, '#7FD1E8']]) h.add(mesh(SPH, mat(c, { roughness: 0.8 }), 0, y, 0, 0.045)); h.add(mesh(SPH_LO, mat('#E0303A', { roughness: 0.3 }), 0, 0.18, 0, 0.012)); break;
        case 'balloon': { h.add(limb(V(0, 0, 0), V(0.05, 0.6, 0), 0.002, mat('#ffffff'))); const b = mesh(SPH, mat('#FF2D55', { roughness: 0.15 }), 0.05, 0.69, 0, 0.09, 0.11, 0.09); h.add(b); K.bob(b, 0.015, 1.3); break; }
        case 'book': { const b = new T.Group(); b.position.set(0, 0.03, 0.03); h.add(b); b.add(mesh(box(0.13, 0.17, 0.03), mat('#3A86FF'))); b.add(mesh(box(0.12, 0.16, 0.026), mat('#FFF9E8'), 0.006, 0, 0)); break; }
        case 'sunflower': stick(0.25, '#3B8E2A', 0.006); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; put(h, mesh(SPH, mat('#FFD60A'), Math.cos(a) * 0.045, 0.3 + Math.sin(a) * 0.045, 0, 0.025, 0.012, 0.006)).rotation.z = a; } h.add(mesh(SPH, mat('#6B3E1A'), 0, 0.3, 0.003, 0.03, 0.03, 0.01)); break;
        case 'paintbrush': stick(0.18, '#FFD60A', 0.007); h.add(mesh(cyl(0.008, 0.01, 0.025), mat('#C0C8D8', { metalness: 0.7 }), 0, 0.2, 0)); h.add(mesh(cone(0.011, 0.05, 12), mat('#E0303A'), 0, 0.24, 0)); break;
        case 'magnifier': stick(0.1, '#2B2140', 0.01); h.add(mesh(torus(0.05, 0.008), mat('#E8B830', { metalness: 0.8, roughness: 0.25 }), 0, 0.16, 0)); h.add(mesh(cyl(0.048, 0.048, 0.004, 32).rotateX(Math.PI / 2), clear('#BDEFFF', 0.35), 0, 0.16, 0)); break;
        case 'bubblewand': stick(0.18, '#FF4F8B', 0.005); h.add(mesh(torus(0.035, 0.005), mat('#FF4F8B'), 0, 0.22, 0)); for (let i = 0; i < 5; i++) { const b = new T.Mesh(SPH, new T.MeshPhysicalMaterial({ color: '#BDEFFF', transparent: true, opacity: 0.35, roughness: 0, depthWrite: false })); b.scale.setScalar(0.02 + i * 0.006); b.position.set(0.06 + i * 0.05, 0.25 + i * 0.05, 0); h.add(b); K.bob(b, 0.02, 0.8 + i * 0.3); } break;
        case 'umbrella': stick(0.45, '#2B2140', 0.007); { const u = mesh(new T.SphereGeometry(0.3, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), side('#9B5DE5'), 0, 0.42, 0); u.scale.y = 0.55; h.add(u); put(h, mesh(torus(0.03, 0.007, Math.PI), mat('#2B2140'), 0.03, -0.04, 0)).rotation.z = Math.PI; } break;
        case 'microphone': stick(0.1, '#2B2140', 0.014); h.add(mesh(SPH, mat('#C0C8D8', { metalness: 0.7, roughness: 0.3 }), 0, 0.13, 0, 0.035)); break;
        case 'wand': stick(0.2, '#2B2140', 0.006); { const s = flat(starShape(0.045), glow('#FFD60A', 0.7), 0.01); s.position.set(0, 0.25, -0.005); h.add(s); K.spin(s, 2, 'z'); for (let i = 0; i < 4; i++) { const sp = mesh(new T.OctahedronGeometry(0.01), glow('#FFF3B0', 1), Math.cos(i * 1.6) * 0.08, 0.25 + Math.sin(i * 1.6) * 0.08, 0); h.add(sp); K.bob(sp, 0.02, 1.5 + i * 0.3); } } break;
        case 'foamsword': h.add(mesh(box(0.035, 0.08, 0.035), mat('#2B2140'), 0, 0, 0)); h.add(mesh(box(0.13, 0.02, 0.04), mat('#FFD60A'), 0, 0.05, 0)); h.add(mesh(box(0.045, 0.42, 0.02), mat('#3A86FF', { roughness: 0.9 }), 0, 0.27, 0)); h.add(mesh(cone(0.032, 0.06, 4), mat('#3A86FF', { roughness: 0.9 }), 0, 0.51, 0)); break;
        case 'teddy': { const t = new T.Group(); t.position.set(0, 0.06, 0.05); h.add(t); const c = mat('#B07A45', { roughness: 0.95 }); t.add(mesh(SPH, c, 0, 0, 0, 0.065, 0.075, 0.05)); t.add(mesh(SPH, c, 0, 0.1, 0, 0.05)); for (const s of [-1, 1]) { t.add(mesh(SPH, c, s * 0.035, 0.145, 0, 0.018)); t.add(mesh(SPH, c, s * 0.06, 0.02, 0.01, 0.022, 0.035, 0.022)); t.add(mesh(SPH, c, s * 0.03, -0.07, 0.02, 0.025)); t.add(mesh(SPH_LO, mat('#1b1230'), s * 0.017, 0.11, 0.045, 0.007)); } t.add(mesh(SPH, mat('#E8C9A0'), 0, 0.09, 0.04, 0.02, 0.015, 0.012)); break; }
        case 'lantern': h.add(limb(V(0, 0, 0), V(0, 0.08, 0), 0.003, mat('#2B2140'))); h.add(mesh(cyl(0.05, 0.06, 0.12, 6), clear('#FF9F1C', 0.5), 0, -0.02, 0)); { const f = mesh(SPH, glow('#FFD24A', 1.4), 0, -0.02, 0, 0.025); h.add(f); K.flicker(f); } h.add(mesh(cyl(0.035, 0.06, 0.02, 6), mat('#E0303A'), 0, 0.05, 0)); break;
        case 'trophy': { const gold = mat('#E8B830', { metalness: 0.85, roughness: 0.2 }); h.add(mesh(box(0.08, 0.025, 0.08), mat('#5a3d20'), 0, 0, 0)); h.add(mesh(cyl(0.012, 0.02, 0.06), gold, 0, 0.04, 0)); h.add(mesh(cyl(0.06, 0.03, 0.09, 24, true), new T.MeshStandardMaterial({ color: '#E8B830', metalness: 0.85, roughness: 0.2, side: T.DoubleSide }), 0, 0.11, 0)); for (const s of [-1, 1]) put(h, mesh(torus(0.022, 0.005), gold, s * 0.065, 0.11, 0)).rotation.y = Math.PI / 2; break; }
      }
    }

    // ----------------------------------------------------------------------------------------------------------
    // Outfits: real clothes (for real.js), drawn extras, and shop items that come with them
    // ----------------------------------------------------------------------------------------------------------
    function outfitExtras(id, f) {   // f: { head, hat (the hat frame), body, R }
      const R = f.R;
      if (id === 'firehelmet' || id === 'firefighter') { const c = mat('#D62828', { roughness: 0.3 }); f.hat.add(mesh(new T.SphereGeometry(R * 1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), c, 0, R * 0.05, 0)); f.hat.add(mesh(SPH, c, 0, R * 0.05, -R * 0.35, R * 1.4, R * 0.07, R * 1.35)); f.hat.add(mesh(SPH, mat('#FFD60A'), 0, R * 0.62, R * 0.9, 0.04, 0.045, 0.01)); }
      if (id === 'knightoutfit') { const sh = flat(shape([[-0.12, 0.12], [0.12, 0.12], [0.12, -0.03], [0, -0.16], [-0.12, -0.03]]), mat('#B8BCC8', { metalness: 0.7, roughness: 0.25 }), 0.02); sh.position.set(0, 0.8, -0.16); sh.rotation.y = Math.PI; f.body.add(sh); }
    }

    // ----------------------------------------------------------------------------------------------------------
    // Pets (g on the floor to her left)
    // ----------------------------------------------------------------------------------------------------------
    function pet(g, id) {
      const eyes = (x, y, z, r, gap) => { for (const s of [-1, 1]) { g.add(mesh(SPH, mat('#ffffff', { roughness: 0.2 }), x + s * gap, y, z, r)); g.add(mesh(SPH, mat('#1b1230'), x + s * gap, y, z + r * 0.6, r * 0.6)); } };
      const legs = (c, sp, y, r, h) => { for (const [x, z] of [[-sp, sp], [sp, sp], [-sp, -sp], [sp, -sp]]) g.add(mesh(CYL, mat(c), x, y, z, r, h, r)); };
      switch (id) {
        case 'fishbowl': { g.add(mesh(cyl(0.06, 0.07, 0.04, 24), mat('#8B5A2B'), 0, 0.02, 0)); g.add(new T.Mesh(SPH, new T.MeshPhysicalMaterial({ color: '#BDEFFF', transparent: true, opacity: 0.3, roughness: 0, depthWrite: false }))); g.children[1].position.set(0, 0.17, 0); g.children[1].scale.setScalar(0.14); const f = new T.Group(); f.position.set(0, 0.17, 0); g.add(f); f.add(mesh(SPH, mat('#FF9F1C', { roughness: 0.3 }), 0.04, 0, 0, 0.03, 0.022, 0.015)); put(f, mesh(cone(0.02, 0.03, 4), mat('#FF9F1C'), 0.08, 0, 0)).rotation.z = Math.PI / 2; K.spin(f, 0.8); break; }
        case 'frogpet': g.add(mesh(SPH, mat('#4CC36B'), 0, 0.07, 0, 0.09, 0.06, 0.08)); for (const s of [-1, 1]) { g.add(mesh(SPH, mat('#4CC36B'), s * 0.04, 0.12, 0.04, 0.03)); g.add(mesh(SPH, mat('#ffffff'), s * 0.04, 0.135, 0.06, 0.018)); g.add(mesh(SPH, mat('#1b1230'), s * 0.04, 0.14, 0.072, 0.009)); g.add(mesh(SPH, mat('#3B9A55'), s * 0.08, 0.03, -0.03, 0.04, 0.025, 0.06)); } K.hop(g, 0.04, 1.2); break;
        case 'hamster': g.add(mesh(SPH, mat('#E8B27A', { roughness: 0.95 }), 0, 0.07, 0, 0.08, 0.07, 0.09)); g.add(mesh(SPH, mat('#FFF3E0', { roughness: 0.95 }), 0, 0.06, 0.05, 0.05, 0.05, 0.05)); for (const s of [-1, 1]) g.add(mesh(SPH, mat('#E8B27A'), s * 0.045, 0.13, 0.02, 0.02, 0.02, 0.008)); eyes(0, 0.1, 0.08, 0.01, 0.025); g.add(mesh(SPH_LO, mat('#FF8FB5'), 0, 0.085, 0.095, 0.008)); break;
        case 'turtle': g.add(mesh(SPH, mat('#4C9A2A', { roughness: 0.7 }), 0, 0.06, 0, 0.12, 0.07, 0.14)); g.add(mesh(SPH, mat('#9BD36B'), 0, 0.05, 0.16, 0.045)); legs('#9BD36B', 0.08, 0.02, 0.025, 0.04); eyes(0, 0.07, 0.19, 0.01, 0.02); break;
        case 'parrot': { const perch = mesh(CYL, mat('#8B5A2B'), 0, 0.25, 0, 0.02, 0.5, 0.02); g.add(perch); put(g, mesh(CYL, mat('#8B5A2B'), 0, 0.5, 0, 0.012, 0.18, 0.012)).rotation.z = Math.PI / 2; g.add(mesh(SPH, mat('#2DC653'), 0, 0.6, 0, 0.05, 0.08, 0.05)); g.add(mesh(SPH, mat('#E0303A'), 0, 0.69, 0.01, 0.04)); put(g, mesh(cone(0.015, 0.04, 8), mat('#FFD60A'), 0, 0.68, 0.05)).rotation.x = Math.PI / 2; put(g, mesh(cone(0.03, 0.15, 8), mat('#3A86FF'), 0, 0.5, -0.04)).rotation.x = -2.8; for (const s of [-1, 1]) { g.add(mesh(SPH, mat('#ffffff'), s * 0.02, 0.7, 0.03, 0.01)); g.add(mesh(SPH, mat('#1b1230'), s * 0.022, 0.7, 0.038, 0.005)); } break; }
        case 'dalmatian': { const c = '#F5F5F5'; g.add(mesh(SPH, mat(c), 0, 0.17, 0, 0.11, 0.09, 0.15)); g.add(mesh(SPH, mat(c), 0, 0.28, 0.12, 0.085)); legs(c, 0.06, 0.06, 0.022, 0.12); eyes(0, 0.3, 0.19, 0.016, 0.034); g.add(mesh(SPH_LO, mat('#1b1230'), 0, 0.27, 0.205, 0.014)); for (const s of [-1, 1]) put(g, mesh(SPH, mat('#1b1230'), s * 0.075, 0.29, 0.1, 0.025, 0.06, 0.03)).rotation.z = s * 0.3; for (let i = 0; i < 8; i++) g.add(mesh(SPH_LO, mat('#1b1230'), Math.cos(i * 2.3) * 0.09, 0.2 + Math.sin(i * 1.7) * 0.03, Math.sin(i * 2.3) * 0.12, 0.018, 0.018, 0.006)); K.wag(g, 'tail'); break; }
        case 'penguin': g.add(mesh(SPH, mat('#1E1E28'), 0, 0.15, 0, 0.09, 0.15, 0.08)); g.add(mesh(SPH, mat('#ffffff'), 0, 0.14, 0.035, 0.07, 0.12, 0.06)); put(g, mesh(cone(0.015, 0.035, 8), mat('#FF9F1C'), 0, 0.24, 0.085)).rotation.x = Math.PI / 2; for (const s of [-1, 1]) { g.add(mesh(SPH, mat('#FF9F1C'), s * 0.04, 0.01, 0.03, 0.03, 0.01, 0.045)); put(g, mesh(SPH, mat('#1E1E28'), s * 0.09, 0.15, 0, 0.015, 0.08, 0.03)).rotation.z = s * 0.2; } eyes(0, 0.26, 0.07, 0.012, 0.025); K.waddle(g); break;
        case 'panda': g.add(mesh(SPH, mat('#ffffff'), 0, 0.14, 0, 0.13, 0.12, 0.12)); g.add(mesh(SPH, mat('#ffffff'), 0, 0.31, 0.03, 0.09)); for (const s of [-1, 1]) { g.add(mesh(SPH, mat('#1E1E28'), s * 0.06, 0.38, 0.02, 0.03)); g.add(mesh(SPH, mat('#1E1E28'), s * 0.035, 0.32, 0.09, 0.022, 0.028, 0.01)); g.add(mesh(SPH, mat('#ffffff'), s * 0.035, 0.325, 0.098, 0.008)); g.add(mesh(SPH, mat('#1E1E28'), s * 0.1, 0.14, 0.05, 0.04, 0.06, 0.04)); g.add(mesh(SPH, mat('#1E1E28'), s * 0.07, 0.04, 0.07, 0.045, 0.035, 0.05)); } g.add(mesh(SPH_LO, mat('#1E1E28'), 0, 0.3, 0.115, 0.012)); break;
        case 'lioncub': { const c = '#E8A33C'; g.add(mesh(SPH, mat(c), 0, 0.17, 0, 0.1, 0.09, 0.15)); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(mesh(SPH, mat('#A85F1A', { roughness: 0.95 }), Math.cos(a) * 0.075, 0.3 + Math.sin(a) * 0.075, 0.1, 0.035)); } g.add(mesh(SPH, mat(c), 0, 0.3, 0.12, 0.075)); legs(c, 0.06, 0.06, 0.022, 0.12); eyes(0, 0.32, 0.18, 0.014, 0.03); g.add(mesh(SPH_LO, mat('#5a3d20'), 0, 0.29, 0.195, 0.012)); break; }
        case 'unicornpet': { const c = '#FFF5FB'; g.add(mesh(SPH, mat(c), 0, 0.26, 0, 0.11, 0.1, 0.17)); g.add(limb(V(0, 0.3, 0.12), V(0, 0.42, 0.18), 0.05, mat(c))); g.add(mesh(SPH, mat(c), 0, 0.46, 0.21, 0.06, 0.055, 0.075)); legs(c, 0.07, 0.1, 0.022, 0.2); put(g, mesh(cone(0.015, 0.1, 16), glow('#FFE680', 0.5), 0, 0.54, 0.23)).rotation.x = 0.4; for (let i = 0; i < 6; i++) g.add(mesh(SPH, mat(RAINBOW[i]), 0, 0.5 - i * 0.04, 0.15 - i * 0.03, 0.025)); for (let i = 0; i < 5; i++) g.add(mesh(SPH, mat(RAINBOW[i]), 0, 0.27 - i * 0.03, -0.18 - i * 0.02, 0.025)); eyes(0, 0.48, 0.26, 0.012, 0.03); break; }
      }
    }

    // ----------------------------------------------------------------------------------------------------------
    // Places. K.ground, K.plinth and K.sky set up the scene; animated bits use K.anim.
    // ----------------------------------------------------------------------------------------------------------
    function place(id) {
      const B = K.backdrop, add = m => { B.add(m); return m; };
      const tree = (x, z, s, leaf) => { add(mesh(CYL, mat('#8B5A2B'), x, 0.5 * s, z, 0.09 * s, s, 0.09 * s)); add(mesh(SPH, mat(leaf || '#2DC653'), x, 1.25 * s, z, 0.55 * s, 0.5 * s, 0.55 * s)); };
      const fall = (n, make, speed, area) => { for (let i = 0; i < n; i++) { const m = add(make(i)); const u = { x: (Math.random() - 0.5) * area, y: Math.random() * 4, z: -Math.random() * area * 0.6 + 1, sp: speed * (0.6 + Math.random() * 0.8), ph: Math.random() * 6 }; K.anim((dt, t) => { u.y -= dt * u.sp; if (u.y < 0) u.y = 4; m.position.set(u.x + Math.sin(t + u.ph) * 0.2, u.y, u.z); }); } };
      switch (id) {
        case 'snow': K.sky('#B8D4F0', '#F2F7FF'); K.ground('#FFFFFF'); for (const [x, z, s] of [[-2.6, -2.5, 1.3], [2.8, -3, 1.5], [-4, -5.5, 1.7], [3.6, -6, 1.6]]) { add(mesh(CYL, mat('#6B4A2B'), x, 0.3 * s, z, 0.07 * s, 0.6 * s, 0.07 * s)); for (let k = 0; k < 3; k++) add(mesh(cone((0.6 - k * 0.15) * s, 0.6 * s, 20), mat('#2E7D4F'), x, (0.8 + k * 0.35) * s, z)); add(mesh(cone(0.3 * s, 0.25 * s, 20), mat('#ffffff'), x, 1.65 * s, z)); } { const sm = new T.Group(); sm.position.set(1.4, 0, -1.2); B.add(sm); sm.add(mesh(SPH, mat('#ffffff'), 0, 0.22, 0, 0.24)); sm.add(mesh(SPH, mat('#ffffff'), 0, 0.55, 0, 0.17)); sm.add(mesh(SPH, mat('#ffffff'), 0, 0.8, 0, 0.12)); put(sm, mesh(cone(0.025, 0.12, 12), mat('#FF9F1C'), 0, 0.8, 0.15)).rotation.x = Math.PI / 2; for (const s of [-1, 1]) sm.add(mesh(SPH_LO, mat('#1b1230'), s * 0.04, 0.84, 0.1, 0.015)); } fall(70, () => mesh(SPH_LO, mat('#ffffff', { emissive: new T.Color('#ffffff'), emissiveIntensity: 0.4 }), 0, 0, 0, 0.02), 0.5, 10); return '#F2F7FF';
        case 'rainbow': K.sky('#7CC6FF', '#E6F6FF'); K.ground('#6FD36B'); for (let i = 0; i < 6; i++) { const r = add(mesh(torus(3.6 - i * 0.22, 0.11), mat(RAINBOW[i], { emissive: new T.Color(RAINBOW[i]), emissiveIntensity: 0.25 }), 0, 0, -6)); r.scale.z = 0.3; } for (let i = 0; i < 4; i++) add(mesh(SPH, mat('#ffffff'), -4 + i * 2.6, 3.2 + (i % 2) * 0.4, -7, 0.7, 0.35, 0.4)); for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = 1 + Math.random() * 3; add(mesh(SPH_LO, mat(RAINBOW[i % 6]), Math.cos(a) * r, 0.03, Math.sin(a) * r - 1, 0.045)); } return '#E6F6FF';
        case 'nightsky': K.sky('#0B1340', '#2E3A7A', 'stars'); K.ground('#24305E'); add(mesh(SPH, glow('#FFF6C9', 0.9), 2.6, 3.1, -6, 0.6)); add(mesh(SPH, mat('#0B1340'), 2.85, 3.25, -5.6, 0.55)); for (let i = 0; i < 30; i++) { const s = add(mesh(new T.OctahedronGeometry(0.04), glow('#FFF3B0', 1), (Math.random() - 0.5) * 12, 1.5 + Math.random() * 3.5, -5 - Math.random() * 3)); const ph = Math.random() * 6; K.anim((dt, t) => { s.scale.setScalar(0.6 + 0.4 * Math.sin(t * 2 + ph)); }); } K.plinth('#3B2F6B', '#7B6CC7'); return null;
        case 'jungle': K.sky('#7ED6A8', '#E3FFE9'); K.ground('#3B8E2A'); for (const [x, z, s] of [[-2.4, -2.2, 1.3], [2.6, -2.6, 1.5], [-4, -4.5, 1.8], [3.8, -5, 1.9], [0.4, -5.8, 1.6], [-1.6, -6.5, 2]]) { add(mesh(CYL, mat('#7A5230'), x, 1.0 * s, z, 0.07 * s, 2 * s, 0.07 * s)); for (let k = 0; k < 7; k++) { const l = add(mesh(SPH, mat(k % 2 ? '#2E9E3F' : '#1F7A33'), x + Math.cos(k) * 0.45 * s, 2.0 * s, z + Math.sin(k) * 0.45 * s, 0.6 * s, 0.05 * s, 0.17 * s)); l.rotation.y = k; l.rotation.z = 0.35; } } for (let i = 0; i < 10; i++) add(mesh(SPH, mat(['#FF4F8B', '#FF9F1C', '#FFD60A'][i % 3]), (Math.random() - 0.5) * 6, 0.1, -1 - Math.random() * 3, 0.07)); { const bf = add(mesh(SPH, mat('#FF2D55'), 1.8, 1.4, -1.5, 0.06, 0.06, 0.05)); K.anim((dt, t) => bf.position.set(1.8 + Math.sin(t * 0.7) * 0.6, 1.4 + Math.sin(t * 1.3) * 0.2, -1.5)); } return '#E3FFE9';
        case 'city': K.sky('#8EC5FF', '#FFE7D1'); K.ground('#9A9AA8'); for (let i = 0; i < 12; i++) { const h = 1.4 + ((i * 37) % 10) * 0.35, x = -6 + i * 1.1; add(mesh(box(0.95, h, 0.9), mat(['#5C6B8A', '#7A86A8', '#C77DFF', '#FF9F1C', '#3A86FF'][i % 5], { roughness: 0.5 }), x, h / 2, -5)); for (let w = 0; w < Math.floor(h / 0.45); w++) for (const wx of [-0.25, 0.25]) add(mesh(box(0.18, 0.2, 0.01), glow('#FFF3B0', 0.4), x + wx, 0.4 + w * 0.45, -4.54)); } add(mesh(box(12, 0.02, 1.2), mat('#3D3D48'), 0, 0.012, -2.6)); for (let i = 0; i < 6; i++) add(mesh(box(0.5, 0.025, 0.1), mat('#ffffff'), -5 + i * 2, 0.02, -2.6)); K.plinth('#ffffff', '#FFE45C'); return '#FFE7D1';
        case 'stage': { K.sky('#1A0B2E', '#3A1D5C'); K.ground('#2B1A40'); add(mesh(cyl(1.6, 1.7, 0.25, 48), mat('#7A4A20', { roughness: 0.6 }), 0, 0.125, 0)); K.setFloor(0.25); for (const s of [-1, 1]) { const c = add(mesh(box(2.5, 5, 0.1), mat('#B0103A', { roughness: 0.8 }), s * 3.2, 2.5, -2.5)); c.rotation.y = -s * 0.3; } for (let i = 0; i < 4; i++) { const beam = add(new T.Mesh(cone(0.6, 5, 24, true), new T.MeshBasicMaterial({ color: RAINBOW[i * 2 % 6], transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide }))); const x = -3 + i * 2; K.anim((dt, t) => { beam.position.set(x + Math.sin(t * 0.8 + i) * 0.8, 2.6, -1); beam.rotation.z = Math.sin(t * 0.8 + i) * 0.3; }); } for (let i = 0; i < 10; i++) add(mesh(SPH_LO, glow(RAINBOW[i % 6], 1), -4 + i * 0.9, 4.6, -2.4, 0.08)); return null; }
        case 'candyland': K.sky('#FFC1E3', '#FFF0F8'); K.ground('#FFD6EC'); for (const [x, z, c] of [[-2.4, -2.5, '#FF4F8B'], [2.5, -2.8, '#3A86FF'], [-3.8, -4.6, '#38E54D'], [3.6, -5, '#FFD60A'], [0.5, -5.5, '#9B5DE5']]) { add(mesh(CYL, mat('#ffffff'), x, 0.7, z, 0.05, 1.4, 0.05)); const l = add(mesh(cyl(0.5, 0.5, 0.12, 32), mat(c, { roughness: 0.2 }), x, 1.6, z)); l.rotation.x = Math.PI / 2; add(mesh(torus(0.32, 0.05), mat('#ffffff'), x, 1.6, z + 0.07)); } for (let i = 0; i < 8; i++) { const cane = new T.Group(); cane.position.set(-3.5 + i, 0, -1.6 - (i % 3) * 0.6); B.add(cane); cane.add(mesh(CYL, mat(i % 2 ? '#FF2D55' : '#ffffff'), 0, 0.3, 0, 0.04, 0.6, 0.04)); cane.add(mesh(torus(0.1, 0.04, Math.PI), mat('#FF2D55'), -0.1, 0.6, 0)); } for (let i = 0; i < 20; i++) add(mesh(SPH_LO, mat(RAINBOW[i % 6], { roughness: 0.2 }), (Math.random() - 0.5) * 7, 0.04, -Math.random() * 4, 0.05)); K.plinth('#FF8FC8', '#FFF0F8'); return '#FFF0F8';
        case 'desert': K.sky('#7CC6FF', '#FFE2B0'); K.ground('#E8C27A'); for (const [x, z, s] of [[-2.5, -2.5, 1], [2.8, -3.2, 1.3], [-4.2, -5, 1.5], [4, -5.5, 1.2]]) { add(mesh(capsule(0.12 * s, 0.9 * s), mat('#3B9A55'), x, 0.6 * s, z)); for (const sd of [-1, 1]) { add(mesh(capsule(0.07 * s, 0.25 * s), mat('#3B9A55'), x + sd * 0.25 * s, 0.75 * s, z)); add(mesh(capsule(0.06 * s, 0.1 * s), mat('#3B9A55'), x + sd * 0.17 * s, 0.6 * s, z)).rotation.z = Math.PI / 2; } } for (let i = 0; i < 3; i++) add(mesh(SPH, mat('#D9A85F'), -3 + i * 3, -0.6, -8, 3, 1.4, 1.5)); add(mesh(SPH, glow('#FFE680', 0.8), 3, 3.6, -9, 0.7)); return '#FFE2B0';
        case 'farm': K.sky('#8EC5FF', '#EAF6FF'); K.ground('#7BC86B'); { add(mesh(box(2, 1.4, 1.4), mat('#C0392B'), -2.8, 0.7, -4)); const roof = add(mesh(cyl(0, 1.25, 0.8, 4), mat('#7A2A20'), -2.8, 1.8, -4)); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.75; add(mesh(box(0.6, 0.8, 0.02), mat('#ffffff'), -2.8, 0.4, -3.29)); } for (let i = 0; i < 10; i++) add(mesh(box(0.06, 0.5, 0.06), mat('#E8D2A8'), 0.5 + i * 0.5, 0.25, -2.5)); add(mesh(box(5, 0.05, 0.04), mat('#E8D2A8'), 2.75, 0.4, -2.5)); { const cow = new T.Group(); cow.position.set(2.5, 0, -3.5); B.add(cow); cow.add(mesh(SPH, mat('#ffffff'), 0, 0.5, 0, 0.35, 0.22, 0.2)); cow.add(mesh(SPH, mat('#ffffff'), 0.38, 0.6, 0, 0.13)); for (const [x, z] of [[-0.2, 0.1], [0.2, 0.1], [-0.2, -0.1], [0.2, -0.1]]) cow.add(mesh(CYL, mat('#ffffff'), x, 0.17, z, 0.04, 0.34, 0.04)); for (let i = 0; i < 4; i++) cow.add(mesh(SPH_LO, mat('#1b1230'), -0.1 + i * 0.08, 0.55 + (i % 2) * 0.06, 0.18, 0.06, 0.05, 0.02)); } add(mesh(SPH, glow('#FFE680', 0.7), -3, 3.6, -9, 0.6)); return '#EAF6FF';
        case 'volcano': K.sky('#FFB38A', '#FFE9D6'); K.ground('#F2D7A0'); { const sea = add(mesh(new T.PlaneGeometry(60, 30), mat('#2E9BD6', { roughness: 0.2 }), 0, 0.01, -16)); sea.rotation.x = -Math.PI / 2; add(mesh(cone(3, 3.2, 32), mat('#6B4A3A'), -1.5, 1.6, -9)); const lava = add(mesh(SPH, glow('#FF5A1F', 1.2), -1.5, 3.2, -9, 0.5, 0.25, 0.5)); K.anim((dt, t) => lava.scale.y = 0.2 + 0.08 * Math.sin(t * 3)); for (let i = 0; i < 6; i++) { const p = add(mesh(SPH, mat('#9A8C98'), -1.5, 3.4, -9, 0.25)); const ph = i; K.anim((dt, t) => { const k = (t * 0.25 + ph / 6) % 1; p.position.set(-1.5 + Math.sin(ph) * k * 0.8, 3.4 + k * 2.5, -9); p.scale.setScalar(0.2 + k * 0.6); }); } } add(mesh(CYL, mat('#8B5A2B'), 2.4, 1, -2, 0.07, 2, 0.07)); for (let i = 0; i < 6; i++) { const l = add(mesh(SPH, mat('#2DC653'), 2.4 + Math.cos(i) * 0.5, 2.0, -2 + Math.sin(i) * 0.5, 0.6, 0.06, 0.18)); l.rotation.y = i; l.rotation.z = 0.3; } return '#FFE9D6';
        case 'sunset': K.sky('#FF7E5F', '#FFD9A0'); K.ground('#F2C38A'); { const sea = add(mesh(new T.PlaneGeometry(60, 20), mat('#E86A7A', { roughness: 0.15, metalness: 0.2 }), 0, 0.01, -12)); sea.rotation.x = -Math.PI / 2; add(mesh(SPH, glow('#FFD24A', 1), 0, 1.0, -14, 1.6)); for (let i = 0; i < 3; i++) add(mesh(SPH, mat('#FFB3A0'), -4 + i * 4, 3.2 + i * 0.3, -10, 1.2, 0.25, 0.4)); for (let i = 0; i < 3; i++) { const bird = add(flat(shape([[-0.12, 0], [0, -0.04], [0.12, 0], [0, -0.015]]), mat('#5a2a3a'))); const ph = i * 2; K.anim((dt, t) => bird.position.set(-3 + ((t * 0.3 + ph) % 6), 3 + Math.sin(t + ph) * 0.1, -6)); } } return '#FFD9A0';
        case 'clouds': K.sky('#A8D8FF', '#FFFFFF'); K.ground('#FFFFFF', 0.3); for (let i = 0; i < 14; i++) add(mesh(SPH, mat('#ffffff', { roughness: 0.95 }), (Math.random() - 0.5) * 10, Math.random() * 0.4, -Math.random() * 6 - 0.5, 0.6 + Math.random() * 0.5, 0.35, 0.5)); { const c = new T.Group(); c.position.set(0, 0, -6); B.add(c); for (const x of [-1.6, 1.6]) { c.add(mesh(CYL, mat('#FFF5FB'), x, 1.6, 0, 0.35, 3.2, 0.35)); c.add(mesh(cone(0.45, 0.8, 24), mat('#FFD60A'), x, 3.6, 0)); } c.add(mesh(box(2.8, 2, 0.5), mat('#FFF5FB'), 0, 1, -0.2)); c.add(mesh(cone(1, 1.2, 4), mat('#C77DFF'), 0, 2.6, -0.2)); } K.plinth('#ffffff', '#E6F3FF'); for (let i = 0; i < 6; i++) { const cl = add(mesh(SPH, mat('#ffffff'), 0, 0, 0, 0.5, 0.25, 0.3)); const ph = i * 1.7, y = 2.4 + (i % 3) * 0.6; K.anim((dt, t) => cl.position.set(-6 + ((t * 0.2 + ph) % 12), y, -4 - (i % 2))); } return '#FFFFFF';
        case 'icecastle': K.sky('#9FD8FF', '#EAF8FF'); K.ground('#DFF3FF'); { const ice = new T.MeshPhysicalMaterial({ color: '#BFE9FF', roughness: 0.05, metalness: 0.1, transmission: 0.2, emissive: new T.Color('#9FD8FF'), emissiveIntensity: 0.15 }); for (const x of [-2.4, 2.4, -1, 1]) { const h = Math.abs(x) > 2 ? 2.6 : 3.4; add(new T.Mesh(cyl(0.4, 0.45, h, 6), ice)).position.set(x, h / 2, -3.6); add(new T.Mesh(cone(0.5, 1, 6), ice)).position.set(x, h + 0.5, -3.6); } const wall = add(new T.Mesh(box(4.4, 1.8, 0.5), ice)); wall.position.set(0, 0.9, -3.9); for (let i = 0; i < 12; i++) { const c = add(new T.Mesh(new T.OctahedronGeometry(0.15), ice)); c.position.set(-3 + i * 0.55, 0.12, -1.6 - (i % 3) * 0.4); c.scale.y = 2; } } fall(40, () => mesh(new T.OctahedronGeometry(0.025), glow('#ffffff', 0.6)), 0.35, 9); K.plinth('#BFE9FF', '#ffffff'); return '#EAF8FF';
        case 'artstudio': K.sky('#FFF1DB', '#FFF8EE'); K.ground('#C9A27A'); add(mesh(box(8, 4, 0.1), mat('#FFF3E0'), 0, 2, -2.6)); for (let i = 0; i < 5; i++) { add(mesh(box(0.7, 0.55, 0.04), mat('#5a3d20'), -2.8 + i * 1.4, 2.4 + (i % 2) * 0.3, -2.53)); add(mesh(box(0.6, 0.45, 0.01), mat(RAINBOW[i]), -2.8 + i * 1.4, 2.4 + (i % 2) * 0.3, -2.5)); } { const e = new T.Group(); e.position.set(2, 0, -1.6); e.rotation.y = -0.4; B.add(e); for (const s of [-1, 1]) e.add(limb(V(s * 0.3, 0, 0), V(0, 1.4, -0.1), 0.02, mat('#8B5A2B'))); e.add(mesh(box(0.7, 0.55, 0.02), mat('#ffffff'), 0, 0.95, 0.03)); for (let i = 0; i < 6; i++) e.add(mesh(SPH_LO, mat(RAINBOW[i]), -0.2 + (i % 3) * 0.2, 0.85 + Math.floor(i / 3) * 0.2, 0.05, 0.05, 0.05, 0.01)); } for (let i = 0; i < 6; i++) add(mesh(SPH, mat(RAINBOW[i]), -1.5 + i * 0.25, 0.01, 1.0 + (i % 2) * 0.2, 0.09, 0.005, 0.07)); return null;
      }
      return undefined;
    }

    // ----------------------------------------------------------------------------------------------------------
    // Sparkles. Each floater gets its own way to move (u.update).
    // ----------------------------------------------------------------------------------------------------------
    function sparkle(id, H, addFloater) {
      const n = { snowflakes: 26, butterflies: 8, notes: 12, confetti: 40, fireflies: 18, leaves: 16, petals: 22, rainbowring: 6 }[id];
      if (!n) return false;
      for (let i = 0; i < n; i++) {
        let m;
        const u = { a: i / n * Math.PI * 2, r: 0.35 + Math.random() * 0.35, y: Math.random() * 1.8 * H, sp: 0.4 + Math.random() * 0.5, ph: Math.random() * 6 };
        const fallDown = (f, dt, t) => { u.y -= dt * u.sp * 0.35; if (u.y < 0) u.y = 1.9 * H; u.a += dt * 0.2; f.position.set(Math.cos(u.a) * u.r + Math.sin(t + u.ph) * 0.05, u.y, Math.sin(u.a) * u.r); f.rotation.set(t * u.sp, t * 0.7 + u.ph, 0); };
        const rise = (f, dt, t, cam) => { u.y += dt * u.sp * 0.25; if (u.y > 1.9 * H) u.y = 0.05; u.a += dt * u.sp * 0.3; f.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r); f.lookAt(cam); };
        switch (id) {
          case 'snowflakes': m = flat(starShape(0.025, 0.25), new T.MeshBasicMaterial({ color: '#ffffff', side: T.DoubleSide })); u.update = fallDown; break;
          case 'confetti': m = new T.Mesh(new T.PlaneGeometry(0.02, 0.012), new T.MeshBasicMaterial({ color: RAINBOW[i % 6], side: T.DoubleSide })); u.update = fallDown; break;
          case 'leaves': m = flat(shape([[0, -0.025], [0.018, 0], [0, 0.025], [-0.018, 0]]), new T.MeshBasicMaterial({ color: ['#E86A1A', '#E8B830', '#C0392B'][i % 3], side: T.DoubleSide })); u.update = fallDown; break;
          case 'petals': m = flat(heartShape(0.012), new T.MeshBasicMaterial({ color: ['#FFB3D1', '#FF8FC8', '#ffffff'][i % 3], side: T.DoubleSide })); u.update = fallDown; break;
          case 'notes': { const g = new T.Group(); const mm = new T.MeshBasicMaterial({ color: ['#9B5DE5', '#3A86FF', '#FF4F8B'][i % 3] }); g.add(mesh(SPH, mm, 0, 0, 0, 0.016, 0.012, 0.004)); g.add(mesh(box(0.004, 0.05, 0.002), mm, 0.014, 0.024, 0)); g.add(mesh(box(0.016, 0.006, 0.002), mm, 0.02, 0.048, 0)); m = g; u.update = rise; break; }
          case 'fireflies': m = new T.Mesh(SPH_LO, new T.MeshBasicMaterial({ color: '#E8FF7A', transparent: true })); m.scale.setScalar(0.012); u.update = (f, dt, t) => { f.position.set(Math.cos(u.a + t * 0.3 * u.sp) * (u.r + 0.2), 0.3 * H + (u.y * 0.6) + Math.sin(t * u.sp + u.ph) * 0.1, Math.sin(u.a + t * 0.3 * u.sp) * (u.r + 0.2)); f.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + u.ph)); }; break;
          case 'butterflies': { const g = new T.Group(); for (const s of [-1, 1]) { const w = flat(heartShape(0.02), new T.MeshBasicMaterial({ color: RAINBOW[i % 6], side: T.DoubleSide })); w.rotation.z = s * 1.2; w.position.x = s * 0.012; g.add(w); } m = g; u.update = (f, dt, t) => { u.a += dt * u.sp * 0.5; f.position.set(Math.cos(u.a) * (u.r + 0.15), 0.4 * H + u.y * 0.5 + Math.sin(t * 2 + u.ph) * 0.08, Math.sin(u.a) * (u.r + 0.15)); f.rotation.y = -u.a; const k = Math.abs(Math.sin(t * 12 + u.ph)); f.children.forEach((w, j) => w.scale.y = 0.4 + 0.6 * k); }; break; }
          case 'rainbowring': m = new T.Mesh(torus(0.55 + i * 0.03, 0.008), new T.MeshBasicMaterial({ color: RAINBOW[i], transparent: true, opacity: 0.8 })); m.rotation.x = Math.PI / 2; u.update = (f, dt, t) => { f.position.y = (0.2 + ((t * 0.15 + i / 6) % 1) * 1.5) * H; f.scale.setScalar(1 + 0.1 * Math.sin(t + i)); }; break;
        }
        addFloater(m, u);
      }
      return true;
    }

    // ----------------------------------------------------------------------------------------------------------
    // Her home screen picture: a background behind her and a frame around her (drawn on the 384 x 384 portrait).
    // ----------------------------------------------------------------------------------------------------------
    function badgeBackground(ctx, id, S) {
      const c = S / 2, grad = (stops, radial) => { const g = radial ? ctx.createRadialGradient(c, c * 0.8, 10, c, c, c) : ctx.createLinearGradient(0, 0, 0, S); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };
      const fill = f => { ctx.fillStyle = f; ctx.fillRect(0, 0, S, S); };
      switch (id) {
        case 'bg-sky': fill(grad(['#59B7FF', '#D9F2FF'])); break;
        case 'bg-mint': fill(grad(['#7CE0B5', '#E9FFF5'])); break;
        case 'bg-sunset': fill(grad(['#FF7E5F', '#FEB47B', '#FFE8B0'])); break;
        case 'bg-ocean': fill(grad(['#1D6FB8', '#5EC6E8'])); ctx.fillStyle = '#ffffff55'; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc((i * 71) % S, S - (i * 37) % (S / 2), 6 + i % 4 * 3, 0, 7); ctx.fill(); } break;
        case 'bg-polka': fill('#FFE45C'); ctx.fillStyle = '#FF4F8B'; for (let y = 0; y < S; y += 48) for (let x = (y / 48) % 2 * 24; x < S; x += 48) { ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); } break;
        case 'bg-candy': for (let i = -S; i < S * 2; i += 40) { ctx.fillStyle = (i / 40) % 2 ? '#FFFFFF' : '#FF8FC8'; ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 20, 0); ctx.lineTo(i + 20 - S, S); ctx.lineTo(i - S, S); ctx.fill(); } break;
        case 'bg-rainbow': RAINBOW.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i * S / 6, S, S / 6 + 1); }); break;
        case 'bg-galaxy': fill(grad(['#3A1D7A', '#0B0425'], true)); for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + (i * 37 % 70) / 100})`; ctx.beginPath(); ctx.arc((i * 97) % S, (i * 61) % S, (i % 3) * 0.8 + 0.6, 0, 7); ctx.fill(); } break;
        default: return false;
      }
      return true;
    }
    function badgeFrame(ctx, id, S) {
      const c = S / 2, r = S / 2 - 14;
      const ring = (style, w) => { ctx.lineWidth = w; ctx.strokeStyle = style; ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.stroke(); };
      const around = (n, draw) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2; ctx.save(); ctx.translate(c + Math.cos(a) * r, c + Math.sin(a) * r); ctx.rotate(a + Math.PI / 2); draw(i); ctx.restore(); } };
      const star = (rr, col) => { ctx.fillStyle = col; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? rr * 0.45 : rr; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.fill(); };
      const heart = (rr, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, rr); ctx.bezierCurveTo(-rr * 1.6, 0, -rr * 0.8, -rr * 1.2, 0, -rr * 0.4); ctx.bezierCurveTo(rr * 0.8, -rr * 1.2, rr * 1.6, 0, 0, rr); ctx.fill(); };
      switch (id) {
        case 'fr-gold': { const g = ctx.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#FFF1A8'); g.addColorStop(0.5, '#E8B830'); g.addColorStop(1, '#A87A10'); ring(g, 22); ring('#ffffff88', 3); break; }
        case 'fr-rainbow': RAINBOW.forEach((col, i) => { ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(c, c, r - 12 + i * 5, 0, 7); ctx.stroke(); }); break;
        case 'fr-sunshine': ring('#FFD60A', 14); around(16, () => { ctx.fillStyle = '#FFB703'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(0, -16); ctx.lineTo(8, 0); ctx.fill(); }); break;
        case 'fr-stars': ring('#3A86FF', 10); around(12, i => star(16, i % 2 ? '#FFD60A' : '#ffffff')); break;
        case 'fr-hearts': ring('#FF8FC8', 10); around(14, i => heart(12, i % 2 ? '#FF2D78' : '#ffffff')); break;
        case 'fr-flowers': ring('#38E54D', 8); around(12, i => { ctx.fillStyle = ['#FF4F8B', '#FFD60A', '#ffffff', '#C77DFF'][i % 4]; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * 8, Math.sin(a) * 8, 7, 0, 7); ctx.fill(); } ctx.fillStyle = '#FF9F1C'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); }); break;
        case 'fr-galaxy': { const g = ctx.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#7B2CBF'); g.addColorStop(1, '#1D6FB8'); ring(g, 22); for (let i = 0; i < 40; i++) { const a = i * 2.4, rr = r + ((i * 13) % 18) - 9; ctx.fillStyle = '#ffffffcc'; ctx.beginPath(); ctx.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, (i % 3) + 1, 0, 7); ctx.fill(); } break; }
        case 'fr-crystal': ring('#BFE9FF', 16); around(10, () => { ctx.fillStyle = '#C77DFF'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(9, 0); ctx.lineTo(0, 18); ctx.lineTo(-9, 0); ctx.fill(); ctx.fillStyle = '#ffffff99'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(4, -2); ctx.lineTo(0, 2); ctx.fill(); }); break;
        default: return false;
      }
      return true;
    }

    return { hat, shades, neck, back, hold, pet, place, sparkle, outfitExtras, badgeBackground, badgeFrame };
  }
  window.AVATAR_EXTRAS = { SHOP, DYES, THEMES, OUTFIT_ITEMS, PRICE_SCALE, make };
})();
