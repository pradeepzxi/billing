/**
 * Aromas - Curated Menu Dataset & Central Category Engine
 * Comprehensive Indian culinary menu spanning Starters, North Indian, South Indian,
 * Biryani & Rice, Street Food/Chaat, Breads, Desserts, Beverages, and Value Combos.
 */

// =============================================================================
// CENTRAL CANONICAL MENU CATEGORIES CONFIGURATION
// =============================================================================
const MENU_CATEGORIES = [
  { 
    id: 'starters', 
    name: 'Starters', 
    label: 'Starters & Appetizers',
    aliases: ['starters', 'starter', 'starters & appetizers', 'appetizer', 'appetizers', 'soup', 'soups', 'starter & appetizers'], 
    icon: 'tapas' 
  },
  { 
    id: 'north-indian', 
    name: 'North Indian', 
    label: 'North Indian Mains',
    aliases: ['north-indian', 'north indian', 'main course', 'main-course', 'mains', 'curry', 'curries', 'gravy', 'north indian mains', 'north indian curries'], 
    icon: 'soup_kitchen' 
  },
  { 
    id: 'south-indian', 
    name: 'South Indian', 
    label: 'South Indian Classics',
    aliases: ['south-indian', 'south indian', 'dosa', 'idli', 'vada', 'uttapam', 'south indian classics'], 
    icon: 'breakfast_dining' 
  },
  { 
    id: 'biryani-rice', 
    name: 'Biryani & Rice', 
    label: 'Biryani & Rice Specialties',
    aliases: ['biryani-rice', 'biryani & rice', 'biryani', 'rice', 'pulao', 'fried rice', 'biryani & rice specialties'], 
    icon: 'rice_bowl' 
  },
  { 
    id: 'street-food', 
    name: 'Street Food', 
    label: 'Street Food & Chaat',
    aliases: ['street-food', 'street food', 'street food & chaat', 'street food / chaat', 'snacks', 'snack', 'chaat', 'fast food', 'fastfood'], 
    icon: 'fastfood' 
  },
  { 
    id: 'breads', 
    name: 'Breads', 
    label: 'Artisanal Breads',
    aliases: ['breads', 'bread', 'roti', 'rotis', 'naan', 'paratha', 'kulcha', 'artisanal breads', 'breads & rotis'], 
    icon: 'bakery_dining' 
  },
  { 
    id: 'desserts', 
    name: 'Desserts', 
    label: 'Decadent Desserts',
    aliases: ['desserts', 'dessert', 'sweets', 'sweet', 'ice cream', 'icecream', 'decadent desserts', 'mithai', 'sweet dish'], 
    icon: 'icecream' 
  },
  { 
    id: 'beverages', 
    name: 'Beverages', 
    label: 'Beverages & Shakes',
    aliases: ['beverages', 'beverage', 'drinks', 'drink', 'beverages & shakes', 'shake', 'shakes', 'tea', 'coffee', 'chai', 'juice', 'juices', 'cold drinks', 'cold drink', 'smoothies'], 
    icon: 'local_cafe' 
  },
  { 
    id: 'combos', 
    name: 'Combos', 
    label: "Chef's Value Combos",
    aliases: ['combos', 'combo', 'thali', 'thalis', 'value combos', "chef's value combos", 'meal', 'meals'], 
    icon: 'set_meal' 
  }
];

/**
 * Authoritative category normalizer.
 * Maps any category input (display name, alias, slug, mixed case) to canonical category ID.
 * NEVER silently falls back to 'starters'.
 */
function normalizeMenuCategory(category) {
  if (!category || typeof category !== 'string') return null;
  const clean = category.trim().toLowerCase().replace(/[\s\-_]+/g, ' ');
  if (!clean) return null;

  for (const cat of MENU_CATEGORIES) {
    if (cat.id === clean || cat.id.replace(/-/g, ' ') === clean || cat.name.toLowerCase() === clean || cat.aliases.includes(clean)) {
      return cat.id;
    }
  }
  // Return clean slug for valid custom categories
  return clean.replace(/\s+/g, '-');
}

/**
 * Returns human-readable display name for any category
 */
function getCategoryDisplayName(category) {
  const normalized = normalizeMenuCategory(category);
  const found = MENU_CATEGORIES.find(c => c.id === normalized);
  if (found) return found.name;
  if (!category) return 'Uncategorized';
  return String(category).charAt(0).toUpperCase() + String(category).slice(1);
}

// Expose category utilities globally
if (typeof window !== 'undefined') {
  window.MENU_CATEGORIES = MENU_CATEGORIES;
  window.normalizeMenuCategory = normalizeMenuCategory;
  window.getCategoryDisplayName = getCategoryDisplayName;
}

const MENU_DATA = [
  // =========================================================================
  // 1. STARTERS (starters)
  // =========================================================================
  {
    id: "starter-samosa",
    name: "Samosa (2 pcs)",
    category: "starters",
    price: 30,
    dietary: "veg",
    tag: "Bestseller",
    tagType: "veg",
    rating: 4.8,
    calories: "280 kcal",
    prepTime: "5-8 min",
    description: "Crisp golden pastry pockets stuffed with spiced potatoes, green peas, roasted cumin & coriander, served with saunth & mint chutney.",
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Mint & Tamarind Chutney", price: 10 },
      { name: "Add Fried Green Chillies", price: 5 }
    ]
  },
  {
    id: "starter-paneer-tikka",
    name: "Paneer Tikka",
    category: "starters",
    price: 110,
    dietary: "veg",
    tag: "Tandoor Special",
    tagType: "veg",
    rating: 4.9,
    calories: "340 kcal",
    prepTime: "12-15 min",
    description: "Juicy fresh cottage cheese cubes marinated in hung curd, Kashmiri deghi mirch, mustard oil and ajwain, roasted over charcoal.",
    image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Chaat Masala & Lemon", price: 5 },
      { name: "Mint Yogurt Dip", price: 15 }
    ]
  },
  {
    id: "starter-chicken-tikka",
    name: "Chicken Tikka",
    category: "starters",
    price: 130,
    dietary: "non-veg",
    tag: "Chef's Cut",
    tagType: "primary",
    rating: 4.9,
    calories: "380 kcal",
    prepTime: "12-15 min",
    description: "Succulent boneless chicken morsels infused with fragrant tandoori spices, ginger-garlic paste and roasted golden on skewers.",
    image: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Butter Basting", price: 15 },
      { name: "Spicy Onion Rings", price: 10 }
    ]
  },
  {
    id: "starter-chicken-65",
    name: "Chicken 65",
    category: "starters",
    price: 120,
    dietary: "non-veg",
    tag: "Spicy",
    tagType: "spicy",
    rating: 4.8,
    calories: "410 kcal",
    prepTime: "10-12 min",
    description: "Crispy fried bite-sized chicken tossed with aromatic curry leaves, slit green chillies, crushed garlic, and fiery red chili paste.",
    image: "https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Crispy Curry Leaves", price: 10 },
      { name: "Lemon Onion Garnish", price: 5 }
    ]
  },
  {
    id: "starter-veg-pakora",
    name: "Vegetable Pakora",
    category: "starters",
    price: 60,
    dietary: "veg",
    tag: "Monsoon Special",
    tagType: "veg",
    rating: 4.6,
    calories: "310 kcal",
    prepTime: "8-10 min",
    description: "Assorted seasonal garden vegetables coated in seasoned besan (gram flour) batter and deep-fried to crunchy golden perfection.",
    image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Green Chutney", price: 10 }
    ]
  },
  {
    id: "starter-hara-bhara-kebab",
    name: "Hara Bhara Kebab",
    category: "starters",
    price: 80,
    dietary: "veg",
    tag: "Healthy Bite",
    tagType: "veg",
    rating: 4.7,
    calories: "220 kcal",
    prepTime: "10-12 min",
    description: "Pan-grilled savory patties crafted from spinach puree, tender green peas, mashed potatoes, fresh mint and cashew halves.",
    image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Cashew Topping", price: 15 },
      { name: "Spicy Dip", price: 10 }
    ]
  },
  {
    id: "starter-seekh-kebab-mutton",
    name: "Seekh Kebab (Mutton)",
    category: "starters",
    price: 140,
    dietary: "non-veg",
    tag: "Royal Treat",
    tagType: "primary",
    rating: 4.9,
    calories: "420 kcal",
    prepTime: "15 min",
    description: "Finely minced tender mutton mixed with crushed coriander seeds, mint, ginger and royal garam masala, char-grilled on long metal skewers.",
    image: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Rumali Roti Wrap", price: 20 },
      { name: "Extra Mint Chutney", price: 10 }
    ]
  },
  {
    id: "starter-tandoori-chicken",
    name: "Tandoori Chicken (Half)",
    category: "starters",
    price: 150,
    dietary: "non-veg",
    tag: "Legendary",
    tagType: "primary",
    rating: 4.9,
    calories: "460 kcal",
    prepTime: "15-18 min",
    description: "Half chicken marinated overnight in spiced yogurt, smoked Kashmiri chillies & fenugreek leaves, charred in our clay tandoor oven.",
    image: "https://images.unsplash.com/photo-1628294895950-9805252327bc?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Butter Glaze", price: 15 },
      { name: "Tandoori Salad", price: 15 }
    ]
  },

  // =========================================================================
  // 2. NORTH INDIAN MAIN COURSE (north-indian)
  // =========================================================================
  {
    id: "main-butter-chicken",
    name: "Butter Chicken",
    category: "north-indian",
    price: 160,
    dietary: "non-veg",
    tag: "Signature Bestseller",
    tagType: "primary",
    rating: 5.0,
    calories: "520 kcal",
    prepTime: "12-15 min",
    description: "Tender tandoori chicken tikka simmered in a velvety, buttery tomato and cashew nut gravy, perfumed with crushed kasuri methi.",
    image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Cream Swirl", price: 15 },
      { name: "Boneless Extra Chunks", price: 35 }
    ]
  },
  {
    id: "main-paneer-butter-masala",
    name: "Paneer Butter Masala",
    category: "north-indian",
    price: 130,
    dietary: "veg",
    tag: "Crowd Favourite",
    tagType: "veg",
    rating: 4.9,
    calories: "450 kcal",
    prepTime: "10-12 min",
    description: "Soft fresh cottage cheese cubes simmered in a mildly sweet, rich and creamy tomato-cashew gravy with a generous pat of butter.",
    image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Paneer Cubes", price: 25 },
      { name: "Grated Cheese Garnish", price: 20 }
    ]
  },
  {
    id: "main-dal-makhani",
    name: "Dal Makhani",
    category: "north-indian",
    price: 90,
    dietary: "veg",
    tag: "Slow-Cooked",
    tagType: "veg",
    rating: 4.8,
    calories: "380 kcal",
    prepTime: "8-10 min",
    description: "Black whole urad lentils and kidney beans slow-simmered over charcoal for 12+ hours with white butter, fresh cream & mild spices.",
    image: "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Desi Ghee Tadka", price: 15 },
      { name: "Extra Cream", price: 10 }
    ]
  },
  {
    id: "main-palak-paneer",
    name: "Palak Paneer",
    category: "north-indian",
    price: 110,
    dietary: "veg",
    tag: "Nutritious",
    tagType: "veg",
    rating: 4.7,
    calories: "320 kcal",
    prepTime: "10 min",
    description: "Fresh tender paneer cubes cooked in a silky, garlic-infused spinach puree with roasted cumin and fragrant garam masala.",
    image: "https://images.unsplash.com/photo-1613292443284-8d10ef9383fe?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Garlic Brown Tadka", price: 10 },
      { name: "Extra Paneer", price: 25 }
    ]
  },
  {
    id: "main-chana-masala",
    name: "Chana Masala",
    category: "north-indian",
    price: 80,
    dietary: "veg",
    tag: "Spicy & Tangy",
    tagType: "veg",
    rating: 4.6,
    calories: "290 kcal",
    prepTime: "8 min",
    description: "Plump kabuli chickpeas simmered in a robust Punjabi onion-tomato gravy flavored with pomegranate seeds and dry mango amchur.",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Bhature (1 pc)", price: 20 },
      { name: "Pickled Onion", price: 5 }
    ]
  },
  {
    id: "main-rajma-masala",
    name: "Rajma Masala",
    category: "north-indian",
    price: 80,
    dietary: "veg",
    tag: "Comfort Classic",
    tagType: "veg",
    rating: 4.8,
    calories: "310 kcal",
    prepTime: "8 min",
    description: "Authentic Jammu & Kashmiri red kidney beans cooked until meltingly soft in a fragrant ginger, garlic and crushed tomato curry.",
    image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Add Rice Portion", price: 30 },
      { name: "Desi Ghee Spoon", price: 10 }
    ]
  },
  {
    id: "main-malai-kofta",
    name: "Malai Kofta",
    category: "north-indian",
    price: 120,
    dietary: "veg",
    tag: "Royal Mughlai",
    tagType: "secondary",
    rating: 4.8,
    calories: "480 kcal",
    prepTime: "12-14 min",
    description: "Crispy fried cottage cheese, potato & raisin dumplings soaked in a rich, mild golden cashew and cardamom scented gravy.",
    image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Kofta (1 pc)", price: 25 },
      { name: "Saffron Cream Drizzle", price: 15 }
    ]
  },
  {
    id: "main-kadai-chicken",
    name: "Kadai Chicken",
    category: "north-indian",
    price: 150,
    dietary: "non-veg",
    tag: "Spicy",
    tagType: "spicy",
    rating: 4.8,
    calories: "460 kcal",
    prepTime: "12-15 min",
    description: "Chicken pieces tossed with freshly roasted kadai masala, crunchy bell peppers, onions and crushed whole red chillies in iron wok.",
    image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Spicy Kadai Masala", price: 10 },
      { name: "Extra Bell Peppers", price: 15 }
    ]
  },
  {
    id: "main-mutton-rogan-josh",
    name: "Mutton Rogan Josh",
    category: "north-indian",
    price: 190,
    dietary: "non-veg",
    tag: "Kashmiri Heritage",
    tagType: "primary",
    rating: 4.9,
    calories: "530 kcal",
    prepTime: "15 min",
    description: "Succulent braised mutton pieces slow-cooked in an aromatic gravy infused with Kashmiri red chillies, fennel seeds, and mace.",
    image: "https://images.unsplash.com/photo-1545247181-516773cae754?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Rogan Gravy", price: 30 },
      { name: "Tandoori Roti (2 pcs)", price: 25 }
    ]
  },

  // =========================================================================
  // 3. SOUTH INDIAN (south-indian)
  // =========================================================================
  {
    id: "south-masala-dosa",
    name: "Masala Dosa",
    category: "south-indian",
    price: 60,
    dietary: "veg",
    tag: "All-Time Hero",
    tagType: "veg",
    rating: 4.9,
    calories: "320 kcal",
    prepTime: "8-10 min",
    description: "Crispy golden fermented rice & lentil crepe stuffed with aromatic spiced potato & onion bhaji, served with piping hot sambar & 3 chutneys.",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Ghee Roast Upgrade", price: 15 },
      { name: "Cheese Burst", price: 25 },
      { name: "Extra Sambar Bowl", price: 10 }
    ]
  },
  {
    id: "south-plain-dosa",
    name: "Plain Dosa",
    category: "south-indian",
    price: 45,
    dietary: "veg",
    tag: "Crispy",
    tagType: "veg",
    rating: 4.7,
    calories: "240 kcal",
    prepTime: "6-8 min",
    description: "Classic paper-thin golden crisp dosa roasted with butter/ghee, served with freshly ground coconut, tomato & coriander chutneys.",
    image: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Butter Topping", price: 10 },
      { name: "Podi Spice Dust", price: 10 }
    ]
  },
  {
    id: "south-idli",
    name: "Idli (2 pcs)",
    category: "south-indian",
    price: 35,
    dietary: "veg",
    tag: "Steamed Healthy",
    tagType: "veg",
    rating: 4.8,
    calories: "160 kcal",
    prepTime: "3-5 min",
    description: "Pillow-soft, steamed fermented rice & black gram cakes served swimming in piping hot vegetable sambar and fresh coconut chutney.",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Ghee Podi Drizzle", price: 15 },
      { name: "Extra Idli (1 pc)", price: 15 }
    ]
  },
  {
    id: "south-vada",
    name: "Vada (2 pcs)",
    category: "south-indian",
    price: 35,
    dietary: "veg",
    tag: "Crunchy",
    tagType: "veg",
    rating: 4.7,
    calories: "280 kcal",
    prepTime: "5 min",
    description: "Golden fried crispy doughnut-shaped savory lentil fritters spiced with crushed black peppercorns, curry leaves & ginger.",
    image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Sambar Dip Style", price: 0 },
      { name: "Extra Vada (1 pc)", price: 18 }
    ]
  },
  {
    id: "south-uttapam",
    name: "Uttapam",
    category: "south-indian",
    price: 55,
    dietary: "veg",
    tag: "Savory Pancake",
    tagType: "veg",
    rating: 4.7,
    calories: "270 kcal",
    prepTime: "8-10 min",
    description: "Thick, fluffy savory rice pancake griddled and loaded with finely chopped red onions, tomatoes, coriander & green chillies.",
    image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Add Grated Paneer", price: 20 },
      { name: "Butter Roast", price: 10 }
    ]
  },
  {
    id: "south-curd-rice",
    name: "Curd Rice",
    category: "south-indian",
    price: 45,
    dietary: "veg",
    tag: "Cooling & Light",
    tagType: "veg",
    rating: 4.8,
    calories: "230 kcal",
    prepTime: "3 min",
    description: "Soothing soft-cooked rice mixed with creamy fresh yogurt, tempered with mustard seeds, curry leaves, ginger & fresh pomegranate pearls.",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "South Indian Pickle", price: 5 },
      { name: "Fried Sun-Dried Chilli (Mor Milagai)", price: 5 }
    ]
  },
  {
    id: "south-bisi-bele-bath",
    name: "Bisi Bele Bath",
    category: "south-indian",
    price: 65,
    dietary: "veg",
    tag: "Karnataka Special",
    tagType: "veg",
    rating: 4.8,
    calories: "340 kcal",
    prepTime: "6-8 min",
    description: "Traditional Karnataka spiced hot-lentil rice cooked with garden vegetables, tamarind, nutmeg, roasted spices and topped with crunchy boondi.",
    image: "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Pure Ghee Tadka", price: 15 },
      { name: "Extra Boondi Crunch", price: 10 }
    ]
  },

  // =========================================================================
  // 4. BIRYANI & RICE (biryani-rice)
  // =========================================================================
  {
    id: "biryani-chicken",
    name: "Chicken Biryani",
    category: "biryani-rice",
    price: 140,
    dietary: "non-veg",
    tag: "Dum Biryani",
    tagType: "primary",
    rating: 5.0,
    calories: "580 kcal",
    prepTime: "10-12 min",
    description: "Aromatic long-grain aged Basmati rice layered with spiced chicken, caramelized onions, mint, saffron milk and slow dum-cooked in handi.",
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Boiled Egg (1 pc)", price: 15 },
      { name: "Extra Spiced Mirchi Ka Salan", price: 15 },
      { name: "Cucumber Mint Raita", price: 15 }
    ]
  },
  {
    id: "biryani-mutton",
    name: "Mutton Biryani",
    category: "biryani-rice",
    price: 180,
    dietary: "non-veg",
    tag: "Royal Dum",
    tagType: "primary",
    rating: 4.9,
    calories: "640 kcal",
    prepTime: "12-15 min",
    description: "Succulent bone-in mutton pieces slow-cooked with basmati rice, shahi jeera, star anise, saffron and clarified butter in sealed pot.",
    image: "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Mutton Piece", price: 50 },
      { name: "Boiled Egg", price: 15 }
    ]
  },
  {
    id: "biryani-veg",
    name: "Vegetable Biryani",
    category: "biryani-rice",
    price: 100,
    dietary: "veg",
    tag: "Garden Fresh",
    tagType: "veg",
    rating: 4.7,
    calories: "420 kcal",
    prepTime: "8-10 min",
    description: "Fragrant basmati rice layered with seasoned paneer, cauliflower florets, carrots, beans, fresh mint, fried onions and saffron.",
    image: "https://images.unsplash.com/photo-1642821373181-696a54913e9a?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Paneer Cubes", price: 20 },
      { name: "Boondi Raita", price: 15 }
    ]
  },
  {
    id: "biryani-egg",
    name: "Egg Biryani",
    category: "biryani-rice",
    price: 90,
    dietary: "non-veg",
    tag: "Student Classic",
    tagType: "secondary",
    rating: 4.7,
    calories: "460 kcal",
    prepTime: "8-10 min",
    description: "Two pan-roasted spiced boiled eggs layered with flavorful long-grain dum basmati rice, golden onions and biryani spices.",
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Boiled Egg", price: 15 },
      { name: "Raita Bowl", price: 15 }
    ]
  },
  {
    id: "rice-jeera",
    name: "Jeera Rice",
    category: "biryani-rice",
    price: 60,
    dietary: "veg",
    tag: "Aromatic",
    tagType: "veg",
    rating: 4.7,
    calories: "280 kcal",
    prepTime: "5 min",
    description: "Fluffy aged basmati rice tempered with roasted fragrant cumin seeds, pure desi ghee and garnished with fresh chopped cilantro.",
    image: "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Fried Onion Topping", price: 10 }
    ]
  },
  {
    id: "rice-steamed-basmati",
    name: "Steamed Basmati Rice",
    category: "biryani-rice",
    price: 50,
    dietary: "veg",
    tag: "Puffed Rice",
    tagType: "veg",
    rating: 4.6,
    calories: "240 kcal",
    prepTime: "4 min",
    description: "Premium quality long-grain white basmati rice steamed to separate, fluffy grains. The perfect partner for curries & dals.",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Add Ghee Dollop", price: 10 }
    ]
  },

  // =========================================================================
  // 5. STREET FOOD / CHAAT (street-food)
  // =========================================================================
  {
    id: "chaat-pani-puri",
    name: "Pani Puri (6 pcs)",
    category: "street-food",
    price: 30,
    dietary: "veg",
    tag: "Street King",
    tagType: "spicy",
    rating: 4.9,
    calories: "180 kcal",
    prepTime: "4 min",
    description: "6 crispy hollow semolina puris filled with spiced potato & black gram, tangy imli chutney and submerged in chilled fiery mint-coriander water.",
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Spicy Teekha Pani", price: 0 },
      { name: "Sweet Meetha Pani Only", price: 0 }
    ]
  },
  {
    id: "chaat-bhel-puri",
    name: "Bhel Puri",
    category: "street-food",
    price: 40,
    dietary: "veg",
    tag: "Tangy Crunch",
    tagType: "veg",
    rating: 4.7,
    calories: "210 kcal",
    prepTime: "4 min",
    description: "Light puffed rice tossed with diced potatoes, onions, crispy papdi, nylon sev, fresh raw mango bits and zesty sweet-tangy chutneys.",
    image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Sev Layer", price: 5 },
      { name: "No Onion Option", price: 0 }
    ]
  },
  {
    id: "chaat-sev-puri",
    name: "Sev Puri",
    category: "street-food",
    price: 40,
    dietary: "veg",
    tag: "Mumbai Classic",
    tagType: "veg",
    rating: 4.8,
    calories: "230 kcal",
    prepTime: "5 min",
    description: "Crispy flat papdis layered with mashed potatoes, chopped onions, trio of chutneys, raw mango, chaat masala and a mountain of nylon sev.",
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Sweet Dahi Topping", price: 10 }
    ]
  },
  {
    id: "chaat-pav-bhaji",
    name: "Pav Bhaji",
    category: "street-food",
    price: 70,
    dietary: "veg",
    tag: "Butter Loaded",
    tagType: "spicy",
    rating: 4.9,
    calories: "450 kcal",
    prepTime: "8-10 min",
    description: "Mashed vegetable curry cooked with tomatoes, butter and Pav Bhaji spices, served with two buttery griddle-toasted soft pav buns & lime.",
    image: "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Butter Pav (2 pcs)", price: 20 },
      { name: "Amul Cheese Grated", price: 20 }
    ]
  },
  {
    id: "chaat-vada-pav",
    name: "Vada Pav",
    category: "street-food",
    price: 25,
    dietary: "veg",
    tag: "Mumbai Burger",
    tagType: "spicy",
    rating: 4.9,
    calories: "260 kcal",
    prepTime: "4 min",
    description: "Spiced golden mashed potato dumpling in besan batter, placed inside a soft bakery pav slathered with dry garlic chutney & green chilli.",
    image: "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Cheese Slice Inside", price: 15 },
      { name: "Extra Dry Garlic Chutney", price: 5 }
    ]
  },
  {
    id: "chaat-aloo-tikki",
    name: "Aloo Tikki Chaat",
    category: "street-food",
    price: 45,
    dietary: "veg",
    tag: "Delhi Special",
    tagType: "veg",
    rating: 4.8,
    calories: "290 kcal",
    prepTime: "6-8 min",
    description: "Golden pan-fried spiced potato cutlets crushed and topped with warm chole, sweetened thick curd, tamarind glaze and sev.",
    image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Sweet Dahi", price: 10 },
      { name: "Extra Chole Scoop", price: 15 }
    ]
  },

  // =========================================================================
  // 6. BREADS (breads)
  // =========================================================================
  {
    id: "bread-plain-naan",
    name: "Plain Naan",
    category: "breads",
    price: 20,
    dietary: "veg",
    tag: "Tandoor Baked",
    tagType: "veg",
    rating: 4.7,
    calories: "160 kcal",
    prepTime: "5 min",
    description: "Traditional soft leavened clay-oven flatbread baked until puffy with charred blister spots.",
    image: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80",
    options: []
  },
  {
    id: "bread-butter-naan",
    name: "Butter Naan",
    category: "breads",
    price: 25,
    dietary: "veg",
    tag: "All-Time Top",
    tagType: "veg",
    rating: 4.9,
    calories: "210 kcal",
    prepTime: "5 min",
    description: "Hand-stretched soft tandoori naan brushed generously with melted Amul butter on coming out of the tandoor.",
    image: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Butter Drizzle", price: 5 }
    ]
  },
  {
    id: "bread-garlic-naan",
    name: "Garlic Naan",
    category: "breads",
    price: 35,
    dietary: "veg",
    tag: "Garlic Infused",
    tagType: "veg",
    rating: 4.9,
    calories: "220 kcal",
    prepTime: "5 min",
    description: "Clay oven naan topped with minced roasted garlic, fresh green coriander leaves and melted butter.",
    image: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Add Grated Cheese", price: 20 }
    ]
  },
  {
    id: "bread-tandoori-roti",
    name: "Tandoori Roti",
    category: "breads",
    price: 15,
    dietary: "veg",
    tag: "Whole Wheat",
    tagType: "veg",
    rating: 4.6,
    calories: "120 kcal",
    prepTime: "4 min",
    description: "Whole wheat atta flatbread baked fresh on the inner walls of the clay oven. Wholesome and light.",
    image: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Butter Application", price: 5 }
    ]
  },
  {
    id: "bread-aloo-paratha",
    name: "Aloo Paratha",
    category: "breads",
    price: 40,
    dietary: "veg",
    tag: "Punjabi Treat",
    tagType: "veg",
    rating: 4.8,
    calories: "290 kcal",
    prepTime: "8 min",
    description: "Crispy griddled whole wheat flatbread stuffed with seasoned spiced mashed potatoes, served with butter & pickle.",
    image: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Fresh Curd Bowl", price: 15 },
      { name: "Extra Butter Cube", price: 10 }
    ]
  },
  {
    id: "bread-lachha-paratha",
    name: "Lachha Paratha",
    category: "breads",
    price: 30,
    dietary: "veg",
    tag: "Flaky & Layered",
    tagType: "veg",
    rating: 4.8,
    calories: "240 kcal",
    prepTime: "6 min",
    description: "Multi-layered flaky whole wheat tandoori flatbread brushed with desi ghee and toasted to a golden crisp.",
    image: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Mint Dust (Pudina)", price: 5 }
    ]
  },

  // =========================================================================
  // 7. DESSERTS (desserts)
  // =========================================================================
  {
    id: "dessert-gulab-jamun",
    name: "Gulab Jamun (2 pcs)",
    category: "desserts",
    price: 35,
    dietary: "veg",
    tag: "Sweet Classic",
    tagType: "primary",
    rating: 4.9,
    calories: "260 kcal",
    prepTime: "2-3 min",
    description: "Warm golden fried khoya dumplings soaked in rose water, saffron and green cardamom scented sugar syrup.",
    image: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Add Vanilla Ice Cream Scoop", price: 25 },
      { name: "Extra Gulab Jamun (1 pc)", price: 18 }
    ]
  },
  {
    id: "dessert-rasgulla",
    name: "Rasgulla (2 pcs)",
    category: "desserts",
    price: 35,
    dietary: "veg",
    tag: "Spongy Sweet",
    tagType: "veg",
    rating: 4.7,
    calories: "190 kcal",
    prepTime: "2 min",
    description: "Delicate and spongy cottage cheese balls cooked in light sugar syrup with a hint of rose and cardamom.",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Rasgulla (1 pc)", price: 18 }
    ]
  },
  {
    id: "dessert-kheer",
    name: "Kheer",
    category: "desserts",
    price: 40,
    dietary: "veg",
    tag: "Rice Pudding",
    tagType: "veg",
    rating: 4.8,
    calories: "240 kcal",
    prepTime: "2 min",
    description: "Slow-simmered rich milk and rice pudding cooked with condensed milk, crushed saffron, cardamom and roasted pistachios.",
    image: "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Roasted Almond Flakes", price: 10 }
    ]
  },
  {
    id: "dessert-gajar-halwa",
    name: "Gajar Ka Halwa",
    category: "desserts",
    price: 50,
    dietary: "veg",
    tag: "Winter Delight",
    tagType: "primary",
    rating: 4.9,
    calories: "320 kcal",
    prepTime: "3 min",
    description: "Slow-cooked grated fresh red carrots with mawa, pure desi ghee, whole milk and studded with cashews and raisins.",
    image: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Warm with Vanilla Ice Cream", price: 25 },
      { name: "Extra Khoya", price: 15 }
    ]
  },
  {
    id: "dessert-kulfi",
    name: "Kulfi",
    category: "desserts",
    price: 35,
    dietary: "veg",
    tag: "Desi Ice Cream",
    tagType: "veg",
    rating: 4.8,
    calories: "210 kcal",
    prepTime: "2 min",
    description: "Traditional dense, creamy frozen dairy dessert on a stick flavored with real saffron strands, pistachio nuts and cardamom.",
    image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Falooda & Rose Syrup Garnish", price: 15 }
    ]
  },

  // =========================================================================
  // 8. BEVERAGES (beverages)
  // =========================================================================
  {
    id: "bev-masala-chai",
    name: "Masala Chai",
    category: "beverages",
    price: 15,
    dietary: "veg",
    tag: "Campus Fuel",
    tagType: "primary",
    rating: 4.9,
    calories: "90 kcal",
    prepTime: "3-5 min",
    description: "Steaming hot Assam milk tea infused with freshly crushed ginger, green cardamom, cloves, cinnamon and black peppercorn.",
    image: "https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Ginger (Adrak)", price: 0 },
      { name: "Less Sugar", price: 0 },
      { name: "Kulhad Cup Upgrade", price: 5 }
    ]
  },
  {
    id: "bev-mango-lassi",
    name: "Mango Lassi",
    category: "beverages",
    price: 40,
    dietary: "veg",
    tag: "Cooling Treat",
    tagType: "veg",
    rating: 4.9,
    calories: "240 kcal",
    prepTime: "3 min",
    description: "Thick, creamy chilled yogurt smoothie blended with sweet Alphonso mango pulp and topped with chopped pistachios.",
    image: "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Malai Topping", price: 10 }
    ]
  },
  {
    id: "bev-sweet-lassi",
    name: "Sweet Lassi",
    category: "beverages",
    price: 35,
    dietary: "veg",
    tag: "Punjabi Style",
    tagType: "veg",
    rating: 4.8,
    calories: "210 kcal",
    prepTime: "3 min",
    description: "Traditional hand-churned sweet whole milk yogurt drink served chilled with a thick layer of fresh malai (clotted cream).",
    image: "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Rose Syrup Swirl", price: 10 }
    ]
  },
  {
    id: "bev-buttermilk-chaas",
    name: "Buttermilk (Chaas)",
    category: "beverages",
    price: 20,
    dietary: "veg",
    tag: "Refreshing",
    tagType: "veg",
    rating: 4.7,
    calories: "65 kcal",
    prepTime: "2 min",
    description: "Light salted churned buttermilk seasoned with roasted cumin powder, black salt, fresh mint leaves and ginger.",
    image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Boondi Sprinkles", price: 5 }
    ]
  },
  {
    id: "bev-filter-coffee",
    name: "Filter Coffee",
    category: "beverages",
    price: 20,
    dietary: "veg",
    tag: "South Indian Special",
    tagType: "primary",
    rating: 4.9,
    calories: "85 kcal",
    prepTime: "3-5 min",
    description: "Authentic South Indian chicory blend coffee brewed in traditional brass filter with hot frothy whole milk.",
    image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Strong Decoction", price: 0 },
      { name: "Less Sugar", price: 0 }
    ]
  },

  // =========================================================================
  // 9. COMBOS (combos)
  // =========================================================================
  {
    id: "combo-student-thali",
    name: "Student Thali (Dal + Sabzi + Rice + Roti + Salad)",
    category: "combos",
    price: 90,
    dietary: "veg",
    tag: "Super Value",
    tagType: "primary",
    rating: 4.9,
    calories: "620 kcal",
    prepTime: "5-8 min",
    description: "The ultimate campus meal thali: Yellow Dal Tadka, Seasonal Mixed Sabzi, Steamed Basmati Rice, 2 Tandoori Rotis, Pickle & Fresh Salad.",
    image: "https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Upgrade to Butter Naan", price: 15 },
      { name: "Add Sweet Gulab Jamun (1 pc)", price: 15 },
      { name: "Add Chilled Chaas", price: 15 }
    ]
  },
  {
    id: "combo-quick-bite",
    name: "Quick Bite Combo (Samosa + Chai)",
    category: "combos",
    price: 40,
    dietary: "veg",
    tag: "Evening Break",
    tagType: "veg",
    rating: 4.8,
    calories: "370 kcal",
    prepTime: "3-5 min",
    description: "One hot crispy potato samosa with mint & imli chutney paired with a piping hot cup of cutting Masala Chai.",
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Add Second Samosa", price: 15 }
    ]
  },
  {
    id: "combo-south-indian",
    name: "South Indian Combo (Idli + Vada + Filter Coffee)",
    category: "combos",
    price: 75,
    dietary: "veg",
    tag: "Breakfast Deal",
    tagType: "veg",
    rating: 4.9,
    calories: "440 kcal",
    prepTime: "5 min",
    description: "1 soft steamed Idli, 1 crispy Medu Vada served with hot sambar & chutneys, accompanied by aromatic South Indian Filter Coffee.",
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Add Extra Vada", price: 18 }
    ]
  },
  {
    id: "combo-chaat",
    name: "Chaat Combo (Pani Puri + Sev Puri)",
    category: "combos",
    price: 60,
    dietary: "veg",
    tag: "Chaat Feast",
    tagType: "spicy",
    rating: 4.8,
    calories: "410 kcal",
    prepTime: "5 min",
    description: "6 pieces of chilled tangy Pani Puri alongside a loaded crunchy plate of Mumbai Sev Puri.",
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Extra Sweet Dahi", price: 10 }
    ]
  },
  {
    id: "combo-biryani",
    name: "Biryani Combo (Veg Biryani + Buttermilk)",
    category: "combos",
    price: 110,
    dietary: "veg",
    tag: "Popular Lunch",
    tagType: "veg",
    rating: 4.8,
    calories: "485 kcal",
    prepTime: "8 min",
    description: "Aromatic Vegetable Dum Biryani served with spiced raita, salan, and a chilled glass of cumin-spiced Buttermilk (Chaas).",
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Add Boiled Egg", price: 15 }
    ]
  },
  {
    id: "combo-roti",
    name: "Roti Combo (2 Naan + Dal Makhani)",
    category: "combos",
    price: 150,
    dietary: "veg",
    tag: "Chef's Recommendation",
    tagType: "veg",
    rating: 4.9,
    calories: "620 kcal",
    prepTime: "8-10 min",
    description: "2 soft tandoori Butter Naans paired with a hearty bowl of slow-cooked buttery Dal Makhani and spiced onions.",
    image: "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Upgrade to Garlic Naan", price: 20 },
      { name: "Add Sweet Lassi", price: 30 }
    ]
  },
  {
    id: "combo-dessert",
    name: "Dessert Combo (Gulab Jamun + Kulfi)",
    category: "combos",
    price: 60,
    dietary: "veg",
    tag: "Sweet Duo",
    tagType: "secondary",
    rating: 4.9,
    calories: "470 kcal",
    prepTime: "3 min",
    description: "1 hot syrupy Gulab Jamun paired with 1 stick of traditional rich Saffron Pistachio Malai Kulfi.",
    image: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Add Extra Gulab Jamun", price: 18 }
    ]
  },
  {
    id: "combo-full-meal",
    name: "Full Meal Combo (Butter Chicken + Naan + Rice + Lassi)",
    category: "combos",
    price: 260,
    dietary: "non-veg",
    tag: "King's Feast",
    tagType: "primary",
    rating: 5.0,
    calories: "890 kcal",
    prepTime: "12-15 min",
    description: "Sumptuous complete feast of rich Butter Chicken, 2 Butter Naans, Jeera Basmati Rice, and a glass of chilled Sweet Lassi.",
    image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80",
    options: [
      { name: "Upgrade to Mango Lassi", price: 10 },
      { name: "Add Gulab Jamun (1 pc)", price: 15 }
    ]
  }
];

// Locations metadata
const LOCATIONS = [
  {
    id: "main-campus",
    name: "Main Campus",
    code: "MC-01",
    status: "Open Now • Closes 11:00 PM",
    address: "Central Square, Academic Block B",
    prepTimeAvg: "10-15 min",
    image: "assets/main-campus.jpg",
    badge: "Student Bestseller",
    description: "Bustling dining hall with live tandoor stations, South Indian counter, and full kitchen."
  },
  {
    id: "au-quasar",
    name: "AU Quasar",
    code: "AQ-02",
    status: "Open Now • 24/7 Service",
    address: "Quantum AI School for Advanced Research, Ground & 1st Floor",
    prepTimeAvg: "8-12 min",
    image: "assets/au-quasar.jpg",
    badge: "Express Pickup",
    description: "Sleek tech hub venue with quick ordering kiosks, street chaat counter & specialty beverages."
  }
];

// Coupons database
const COUPONS = {
  "AROMAS20": { discountPercent: 20, description: "20% off total order" },
  "WELCOME50": { flatDiscount: 50, minOrder: 200, description: "₹50 off on orders above ₹200" },
  "TASTY10": { discountPercent: 10, description: "10% off anytime discount" },
  "CAMPUSFREE": { flatDiscount: 15, description: "Special Campus Treat (₹15 off)" }
};

// Expose Base Catalog & Metadata globally
if (typeof window !== 'undefined') {
  window.MENU_DATA = MENU_DATA;
  window.LOCATIONS = LOCATIONS;
  window.COUPONS = COUPONS;
}

/**
 * =========================================================================
 * Aromas Menu & Stock Service
 * Provides dynamic menu catalog, stock inventory, and sales bestseller tracking
 * =========================================================================
 */
const AromasMenuService = {
  KEYS: {
    STOCK: 'aromas_item_stock',
    CUSTOM_DISHES: 'aromas_custom_dishes',
    MENU_OVERRIDES: 'aromas_menu_overrides'
  },

  DEFAULT_STOCK: 20,

  /**
   * Returns active menu list (Single Source of Truth via Firebase Service)
   */
  getActiveMenu() {
    if (window.AromasFirebaseService) {
      return window.AromasFirebaseService.getMenu();
    }
    return MENU_DATA;
  },

  /**
   * Find item by ID in active catalog
   */
  getItemById(itemId) {
    if (window.AromasFirebaseService) {
      return window.AromasFirebaseService.getMenuItem(itemId);
    }
    return MENU_DATA.find(i => i.id === itemId) || null;
  },

  /**
   * Add a new custom dish from the kitchen
   */
  addCustomDish(dishData) {
    if (window.AromasFirebaseService) {
      return window.AromasFirebaseService.addMenuItem(dishData);
    }
    return null;
  },

  /**
   * Update dish details (name, category, price, description, etc.)
   */
  updateCustomDish(dishId, updateData) {
    if (window.AromasFirebaseService) {
      return window.AromasFirebaseService.updateMenuItem(dishId, updateData);
    }
    return null;
  },

  /**
   * Delete custom dish
   */
  deleteCustomDish(dishId) {
    if (window.AromasFirebaseService) {
      return window.AromasFirebaseService.deleteMenuItem(dishId);
    }
    return false;
  },

  /**
   * Unified authoritative dish image resolver
   */
  getDishImage(dish) {
    if (window.AromasFirebaseService && typeof window.AromasFirebaseService.getDishImage === 'function') {
      return window.AromasFirebaseService.getDishImage(dish);
    }
    const DEFAULT_FALLBACK = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';
    if (!dish) return DEFAULT_FALLBACK;
    return dish.imageUrl || dish.image || DEFAULT_FALLBACK;
  },

  /**
   * Validate image file
   */
  validateDishImage(file) {
    if (window.AromasFirebaseService && typeof window.AromasFirebaseService.validateDishImage === 'function') {
      return window.AromasFirebaseService.validateDishImage(file);
    }
    return { valid: true };
  },

  /**
   * Upload dish image
   */
  async uploadDishImage(fileOrBlob, dishId, onProgress) {
    if (window.AromasFirebaseService && typeof window.AromasFirebaseService.uploadDishImage === 'function') {
      return await window.AromasFirebaseService.uploadDishImage(fileOrBlob, dishId, onProgress);
    }
    return { success: true, imageUrl: '', imageVersion: Date.now() };
  },

  /**
   * Get all stock entries map
   */
  getAllStock() {
    if (window.AromasFirebaseService) {
      return window.AromasFirebaseService.getAllStock();
    }
    return {};
  },

  /**
   * Get stock count for a specific item
   */
  getItemStock(itemId, defaultVal = 20) {
    if (window.AromasFirebaseService) {
      return window.AromasFirebaseService.getStock(itemId);
    }
    return defaultVal;
  },

  /**
   * Set specific stock count for item
   */
  setItemStock(itemId, count) {
    if (window.AromasFirebaseService) {
      return window.AromasFirebaseService.updateStock(itemId, count);
    }
    return count;
  },

  /**
   * Adjust item stock by delta (+/-)
   */
  adjustItemStock(itemId, delta) {
    if (window.AromasFirebaseService) {
      if (delta >= 0) return window.AromasFirebaseService.incrementStock(itemId, delta);
      return window.AromasFirebaseService.decrementStock(itemId, Math.abs(delta));
    }
    return 20;
  },

  /**
   * Decrement stock when an order is placed
   */
  decrementStockForOrder(cartItems) {
    if (window.AromasFirebaseService) {
      cartItems.forEach(item => {
        window.AromasFirebaseService.decrementStock(item.id, item.qty || 1);
      });
    }
  },

  /**
   * Calculate top-selling / most-ordered items
   */
  getMostSellingStats() {
    if (window.AromasFirebaseService) {
      return window.AromasFirebaseService.getMostSellingStats();
    }
    return { topDishId: 'biryani-chicken', topSalesCount: 52, salesMap: {} };
  },

  /**
   * Broadcast cross-tab and in-page event
   */
  notifyChange() {
    if (window.AromasFirebaseService) {
      window.AromasFirebaseService.broadcast('MENU_UPDATED', window.AromasFirebaseService.getMenu());
    }
  }
};

// Expose globally
window.AromasMenuService = AromasMenuService;

