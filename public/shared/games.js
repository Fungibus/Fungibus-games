export const games = [
  {
    slug: "codenames",
    title: "Codename Grid",
    status: "Playable",
    route: "/codenames/",
    apiNamespace: "/api/codenames",
    description:
      "A lightweight shared word board for clue-giving, guessing, and keeping teams moving through a clean room.",
  },
  {
    slug: "decrypto",
    title: "Decrypto",
    status: "Playable",
    route: "/decrypto/",
    apiNamespace: "/api/decrypto",
    description:
      "A shared team code table with secret keyword screens, clue rounds, interception guesses, and automatic score tracks.",
  },
  {
    slug: "skull",
    title: "Skull",
    status: "Playable",
    route: "/skull/",
    apiNamespace: "/api/skull",
    description:
      "A shared bluffing table with hidden flowers and skulls, rising bids, forced reveals, lives, eliminations, and two-challenge wins.",
  },
  {
    slug: "wordle",
    title: "Wordle",
    status: "Planned",
    route: null,
    apiNamespace: null,
    description:
      "A compact daily-style word puzzle with simple keyboard input, clear feedback, and fast rounds.",
  },
];
