import { conversation } from "../station/dialogue.js";

export function renderDialogue(parent, sector, save, node, choose, button) {
  const page = conversation(sector, save)[node];
  if (!page) return;
  const speech = document.createElement("p");
  const speaker = document.createElement("strong");
  speaker.textContent = `${page.speaker}: `;
  speech.append(speaker, `“${page.text}”`);
  const choices = document.createElement("div");
  choices.className = "dialogue-choices";
  for (const [label, next] of page.choices)
    choices.append(button(label, () => choose(next)));
  parent.append(speech, choices);
}
