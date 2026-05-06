export const USERS = {
  current: {
    id: "u1",
    name: "Admin Alex",
    role: "super_admin",
    avatar: "https://images.unsplash.com/photo-1707396172424-f3293f788364?crop=entropy&cs=tinysrgb&fit=facearea&facepad=2&w=256&h=256&q=80",
    isOnline: true,
  },
  u2: {
    id: "u2",
    name: "Elena M.",
    role: "member",
    avatar: "https://images.unsplash.com/photo-1530790553298-cf375988a44a?crop=entropy&cs=tinysrgb&fit=facearea&facepad=2&w=256&h=256&q=80",
    isOnline: false,
  },
  system: {
    id: "system",
    name: "System",
    role: "system",
    avatar: "https://images.unsplash.com/photo-1570221622224-3bb8f08f166c?crop=entropy&cs=tinysrgb&fit=facearea&facepad=2&w=256&h=256&q=80",
    isOnline: true,
  }
};

export const INITIAL_MESSAGES = [
  {
    id: "m1",
    authorId: "system",
    content: "Welcome to the Enterprise Live Chat. Please be respectful and follow the guidelines.",
    timestamp: "2026-04-24T09:00:00Z",
    type: "system",
  },
  {
    id: "m2",
    authorId: "u2",
    content: "Hello everyone! Happy to join the community.",
    timestamp: "2026-04-24T09:05:00Z",
    type: "text",
    reactions: [{ emoji: "👋", count: 4 }]
  },
  {
    id: "m3",
    authorId: "u1",
    content: "Hi Elena! Let me know if you need any help getting set up.",
    timestamp: "2026-04-24T09:10:00Z",
    type: "text",
    replyTo: "m2"
  }
];

export const MESSAGES = [
  {
    id: "1",
    author: USERS.system,
    content: "Welcome to the Enterprise Live Chat. Please be respectful and follow the guidelines.",
    time: "09:00 AM",
  },
  {
    id: "2",
    author: USERS.u2,
    content: "Hello everyone! Happy to join the community.",
    time: "09:05 AM",
  },
  {
    id: "3",
    author: USERS.current,
    content: "Hi Elena! Let me know if you need any help getting set up.",
    time: "09:10 AM",
  }
];

export const MOD_QUEUE = [
  {
    id: "mod1",
    authorId: "u3",
    authorName: "Spammer99",
    content: "Buy cheap crypto here!!! http://spam-link.local",
    reason: "Link policy violation",
    riskScore: "High",
    timestamp: "2026-04-24T09:12:00Z"
  }
];

export const ADMIN_STATS = {
  activeUsers: 1432,
  messagesToday: 5621,
  openTickets: 12,
  rejectedMessages: 43
};
