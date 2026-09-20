// Static catalogue. Synthetic; none of these places exist.

export const RESTAURANTS = [
  { id: "hearth", name: "Hearth & Vine", cuisine: "Modern European", area: "Old Town",
    price: 3, rating: 4.6, blurb: "Wood-fired plates and a short, stubborn wine list." },
  { id: "olivias", name: "Olivia's Kitchen", cuisine: "Italian", area: "Riverside",
    price: 2, rating: 4.4, blurb: "Family trattoria. The lasagne is the whole point." },
  { id: "nori", name: "Nori House", cuisine: "Japanese", area: "Market District",
    price: 3, rating: 4.7, blurb: "Counter seating, twelve covers, one sitting a night." },
  { id: "saffron", name: "Saffron Road", cuisine: "South Asian", area: "Northgate",
    price: 2, rating: 4.5, blurb: "Slow-cooked, generous, and louder than you expect." },
  { id: "the-quarry", name: "The Quarry", cuisine: "Steakhouse", area: "Docklands",
    price: 4, rating: 4.2, blurb: "Converted stoneworks. Book the mezzanine." },
  { id: "greenhouse", name: "Greenhouse", cuisine: "Vegetarian", area: "Old Town",
    price: 2, rating: 4.3, blurb: "Everything grows on the roof, allegedly." },
];

export const byId = (id) => RESTAURANTS.find((r) => r.id === id) || null;

// The late slots were added months after the first set, by someone else, without the
// leading zero. Nobody noticed because nothing sorted them until the reservations list.
export const SLOTS = ["9:00", "9:30", "12:00", "12:30", "18:00", "18:30", "19:00", "19:30", "20:00"];

export const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];

export const MAX_PARTY = 8;   // tables physically seat 8; larger parties go through events
