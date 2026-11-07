// Starting settings for a new ledger. Budgets and goal targets start at 0 for the user to fill in.
export const DEFAULTS = {
  version: 1,
  base: "QAR",
  cycleStart: 1,
  savingsTarget: 0,
  recurring: [],
  scenarios: [],
  fx: { QAR: 1, USD: 3.64, EUR: 4.0551, GBP: 4.8604, PHP: 0.0578 },
  fxNote: "Rates set 7 Nov 2026. USD is the fixed peg; EUR and PHP from mid-market quotes; GBP derived from EUR/QAR and EUR/GBP.",
  accounts: ["Bank", "Cash", "Credit card"],
  categories: [
    ["rent", "Rent & utilities"], ["groceries", "Groceries"], ["eating", "Eating out"], ["transport", "Transport & fuel"],
    ["car", "Car (service, insurance)"], ["phone", "Phone & internet"], ["subs", "Subscriptions"], ["shopping", "Shopping"],
    ["fun", "Fun & games"], ["health", "Health & fitness"], ["travel", "Travel"], ["family", "Family (sent home)"],
    ["learning", "Courses & certifications"], ["gifts", "Gifts"], ["other", "Other"]
  ].map(([id, name]) => ({ id, name, kind: "expense", budget: 0 }))
    .concat([["salary", "Salary"], ["allowance", "Allowances"], ["bonus", "Bonus"], ["otherinc", "Other income"]]
      .map(([id, name]) => ({ id, name, kind: "income", budget: 0 }))),
  goals: [
    { id: "emergency", name: "Emergency fund", target: 0, start: 0, monthly: 0, growth: 0, deadline: "" },
    { id: "invest", name: "Investments (IBKR)", target: 0, start: 0, monthly: 0, growth: 0, deadline: "" },
    { id: "trip", name: "Singapore + Manila trip", target: 0, start: 0, monthly: 0, growth: 0, deadline: "2027-04-01" },
    { id: "relocation", name: "Relocation fund", target: 0, start: 0, monthly: 0, growth: 0, deadline: "" }
  ]
};
