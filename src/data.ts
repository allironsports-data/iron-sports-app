import type { TeamMember, Player, Task } from "./types";

export const teamMembers: TeamMember[] = [
  { id: "tm1",  name: "Borja García-Fuster", avatar: "BGF" },
  { id: "tm2",  name: "Daniel Muñoz",         avatar: "DM"  },
  { id: "tm3",  name: "Pablo Peña",           avatar: "PP"  },
  { id: "tm4",  name: "Ruben Pinedo",         avatar: "RP"  },
  { id: "tm5",  name: "Nahuel Beau",          avatar: "NB"  },
  { id: "tm6",  name: "Antonio Villalonga",   avatar: "AV"  },
  { id: "tm7",  name: "Pablo Gayan",          avatar: "PG"  },
  { id: "tm8",  name: "Nacho Sanchis",        avatar: "NS"  },
  { id: "tm9",  name: "Alberto Toldra",       avatar: "AT"  },
  { id: "tm10", name: "Lorenzo Toldra",       avatar: "LT"  },
  { id: "tm11", name: "Carlos Muñoz",         avatar: "CM"  },
  { id: "tm12", name: "Borja Marín",          avatar: "BM"  },
  { id: "tm13", name: "Agustin Pereyra",      avatar: "AP"  },
];

export const initialPlayers: Player[] = [
  {
    id: "p1",
    name: "Carlos de Roa",
    birthDate: "2007-07-10",
    positions: ["Lateral izquierdo", "Central izquierdo"],
    nationality: "España",
    photo: "",
    clubs: [
      { name: "Betis Juvenil",    type: "compartido", league: "División de Honor Juvenil" },
      { name: "Betis Deportivo",  type: "compartido", league: "Segunda Federación" },
    ],
    partner: "Toldra",
    managedBy: ["tm3", "tm5"], // Pablo Peña, Nahuel Beau
    representationContract: {
      start: "2024-08-27",
      end:   "2027-08-27",
    },
    clubContract: {
      endDate:       "2028-06-30",
      optionalYears: 2,
    },
    contractHistory: [
      { club: "Betis Deportivo / Betis Juvenil", period: "2024–presente", type: "Cantera / Filial" },
    ],
    performance: [],
    info: {
      family:      "",
      languages:   ["Español"],
      personality: "",
      interests:   "",
      location:    "",
      notes:       "",
    },
  },
];

export const initialTasks: Task[] = [
  {
    id: "t1",
    playerId: "p1",
    title: "Preparar dosier para clubes interesados",
    description: "Compilar vídeos y estadísticas de Carlos para presentación a clubes",
    assigneeId: "tm5",
    status: "pendiente",
    priority: "alta",
    dueDate: "2026-04-15",
    createdAt: "2026-04-01",
    comments: [],
  },
];
