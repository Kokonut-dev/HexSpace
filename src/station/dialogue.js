import { nebula } from "../world/universe.js";

export function conversation(s, d) {
  const reputation = d.rep[s.faction] ?? 0;
  return {
    welcome: {
      speaker: s.depth ? "Keeper Sera" : "Dispatcher Vale",
      text:
        reputation >= 5
          ? `Good to see you again. ${s.faction} remembers who keeps the lanes open.`
          : "New transponder in my cantina. Are you looking for work or a little local knowledge?",
      choices: [
        ["Anything unusual nearby?", "rumor"],
        ["Who controls the trade lanes?", "faction"],
        ["Show me the contract board.", "board"],
      ],
    },
    rumor: {
      speaker: "Watch officer",
      text: nebula(s)
        ? "The purple cloud is an ion nebula. Radiators barely work inside it. Let your weapons cool before you cross."
        : s.depth % 3 === 2
          ? "There’s a derelict on the scanner. Bring an empty cargo hold if you plan to investigate."
          : "Distress signals aren’t always what they seem. Scan from the edge of range and keep an exit vector.",
      choices: [
        ["Ask about the trade lanes.", "faction"],
        ["Back.", "welcome"],
      ],
    },
    faction: {
      speaker: "Watch officer",
      text: `${s.faction} operates this relay. ${s.contested ? "Control is contested, and the market is charging a risk premium." : "The trade lanes are stable for now."} Deliver contracts at headquarters to build a reputation.`,
      choices: [
        ["Show me the contract board.", "board"],
        ["Back.", "welcome"],
      ],
    },
  };
}
