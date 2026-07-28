// Auto-generated from the worldwithin.org site map. Merges the extracted company
// overview into World Withins client profile, then reloads. Run from the console:
//   import(/ww-overview.js)
(() => {
  const patch = {
  "website": "worldwithin.org",
  "industry": "Nonprofit / Impact investment & storytelling",
  "voice": "Movement-driven and conviction-led, pairing hard inequality statistics with aspirational, accessible rallying cries like 'we make being good cool.' Reads as activist yet credible, blending economic critique with optimism.",
  "oneLiner": "A 501(c)(3) nonprofit that invests in community-owned businesses and tells their stories through film, podcasts, and journalism.",
  "mission": "Building an economy that's owned by the many, not just the few, by funding decentralized and community-owned models that keep wealth and power in the hands of local communities.",
  "founded": "2025, Helena, MT",
  "headquarters": "Helena / Montana (governed by Montana law, Lewis and Clark County)",
  "traction": "Founded 2025 with active investments in Old Salt Co-op, Hawaiʻi ʻUlu Co-Op, Revillage, and Warsaw Federal, plus a 14-episode podcast series.",
  "team": [
    {
      "name": "Rostam Zafari",
      "role": "Founder & CEO"
    },
    {
      "name": "Emma Ractliffe",
      "role": "Head of Investments"
    },
    {
      "name": "Dylan Mulick",
      "role": "Co-Founder & Chief Content Officer"
    },
    {
      "name": "Jacob Mosler",
      "role": "Chief Operating Officer"
    },
    {
      "name": "Radhika Womack",
      "role": "VP Operations"
    },
    {
      "name": "Jason Bowers",
      "role": "Head of Production"
    },
    {
      "name": "Nicholas Mihm",
      "role": "Creative Producer"
    },
    {
      "name": "Alex Miller",
      "role": "Head of Podcasts"
    },
    {
      "name": "Kayuri Bhimani",
      "role": "Director of Advisory"
    },
    {
      "name": "Chris Church",
      "role": "Chief Marketing Officer"
    }
  ],
  "products": [
    "Community Ownership Fund (redeemable equity, program-related investments)",
    "Documentary film and storytelling",
    "How to Change the World podcast",
    "How to Change the World documentary series",
    "Mentorship and advisory for founders, donors, and practitioners"
  ],
  "differentiators": [
    "Tackles the root cause of inequality by changing how wealth is created, not just taxation",
    "Invests for equity into community-owned businesses without taking control",
    "Uses returns from investments to fund new projects, a self-replenishing cycle",
    "Combines patient capital, storytelling, and mentorship in one model"
  ],
  "notableClients": [
    "Old Salt Co-op",
    "Hawaiʻi ʻUlu Co-Op",
    "Revillage",
    "Warsaw Federal",
    "Alex Honnold (Honnold Foundation)",
    "Brandon Stanton (Humans of New York)",
    "Geralyn Dreyfous",
    "Sam Kass",
    "Mehul Bhagat (Elea Collective)",
    "Brian Boland (Delta Fund)"
  ],
  "values": [
    "Community ownership",
    "Cooperative economics",
    "Wealth circulating within communities",
    "Finance that builds, not extracts"
  ],
  "channels": [
    "https://www.youtube.com/@worldwithinstudios",
    "https://www.instagram.com/worldwithinimpact",
    "https://www.linkedin.com/company/worldwithinimpact",
    "https://www.tiktok.com/@worldwithinstudios"
  ]
};
  const PK = "stoplight.clientProfiles.v1";
  const profiles = JSON.parse(localStorage.getItem(PK) || "{}");
  profiles["World Within"] = { ...(profiles["World Within"] || {}), ...patch };
  localStorage.setItem(PK, JSON.stringify(profiles));
  const CK = "stoplight.clients.v1";
  const clients = JSON.parse(localStorage.getItem(CK) || "[]");
  if (!clients.includes("World Within")) { clients.push("World Within"); localStorage.setItem(CK, JSON.stringify(clients)); }
  console.log("[ww-overview] loaded overview for World Within:", Object.keys(patch).join(", "));
  location.reload();
})();
