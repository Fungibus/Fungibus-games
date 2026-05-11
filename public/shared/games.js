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
    slug: "skull",
    title: "Skull",
    status: "Playable",
    route: "/skull/",
    apiNamespace: "/api/skull",
    description:
      "A shared bluffing table for placing flowers and skulls, bidding high, and flipping just enough discs to survive.",
    slug: "decrypto",
    title: "Decrypto",
    status: "Playable",
    route: "/decrypto/",
    apiNamespace: "/api/decrypto",
    description:
      "A shared team code table with secret keyword screens, clue rounds, interception guesses, and automatic score tracks.",
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
