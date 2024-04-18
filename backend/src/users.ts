import neo4j, { Session } from "neo4j-driver";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import User, { userSchema } from "./models/User.js";
import removeKeys from "./misc/removeKeys.js";
import wordToVec from "./misc/wordToVec.js";
import DbUser from "./models/DbUser.js";
import kcAdminClient from "./kcAdminClient.js";
import UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation.js";
import { Either } from "./misc/Either.js";
import NativeUser, { nativeUserSchema } from "./models/NativeUser.js";
import ExternalUser from "./models/ExternalUser.js";
import { ZodType } from "zod";

export const filterUser = (user: DbUser): User => {
  if ("password" in user) {
    return removeKeys(user, ["name_embedding", "password"]);
  } else {
    return removeKeys(user, ["name_embedding", "issuer", "issuer_id"]);
  }
};

const registerUserToKeycloakUser = (
  user: RegisterUser,
): UserRepresentation => ({
  enabled: true,
  firstName: user.first_name,
  lastName: user.last_name,
  credentials: [
    {
      type: "password",
      value: user.password,
      temporary: false,
    },
  ],
  email: user.mail,
  emailVerified: true,
});

function getResponse(e: any): Response | null {
  if (!e || !e.response) {
    return null;
  }

  return e.response;
}

export type RegisterUser = Omit<User, "id"> & NativeUser;
export type CreateUser = Omit<User, "id"> & Either<NativeUser, ExternalUser>;
export type UpdateUser = Partial<Omit<User, "id">>;
export type UserCreateResult = User | { errors: Record<string, string> };

export const registerUserSchema = userSchema
  .omit({ id: true })
  .merge(nativeUserSchema) satisfies ZodType<RegisterUser>;

export const updateUserSchema = userSchema
  .omit({
    id: true,
  })
  .partial() satisfies ZodType<UpdateUser>;

async function createUserQuery(
  session: Session,
  userData: DbUser,
): Promise<User> {
  const userResult = await session.run(`CREATE (u:User $user) RETURN u`, {
    user: userData,
  });

  const user = filterUser(userResult.records[0].get("u").properties);
  return user;
}

export async function createUser(
  session: Session,
  userData: CreateUser,
): Promise<UserCreateResult> {
  if ("password" in userData) {
    const existsUser = await getDbUser(session, { mail: userData.mail });

    if (existsUser) {
      return { errors: { id: "already exists" } };
    }
  } else {
    const existsUser = (await getDbUser(session, {
      mail: userData.mail,
      issuer: userData.issuer,
    })) as (DbUser & ExternalUser) | null;

    if (existsUser) {
      if (existsUser.issuer_id != userData.issuer_id) {
        await updateUser(session, existsUser.id, {
          issuer_id: userData.issuer_id,
        });
      }

      return { errors: { id: "already exists" } };
    }
  }

  const nameEmbeddingResult = await generateNameEmbedding(
    userData.first_name,
    userData.last_name,
  );
  const { success, firstNameCorrect, lastNameCorrect, nameEmbedding } =
    nameEmbeddingResult;

  const errors: Record<string, string> = {};

  if (!success) {
    if (!firstNameCorrect) {
      errors["first_name"] = "incorrect";
    }

    if (!lastNameCorrect) {
      errors["last_name"] = "incorrect";
    }

    return { errors };
  }

  const id = uuidv4();
  let user = { ...userData, id, name_embedding: nameEmbedding } as DbUser;

  if ("password" in userData) {
    const { password } = userData;
    const passwordHashed = await bcrypt.hash(password, 10);
    user = { ...user, password: passwordHashed };
  }

  return createUserQuery(session, user);
}

export async function registerUser(
  session: Session,
  userData: RegisterUser,
): Promise<User> {
  let keycloakId: string = "";

  try {
    keycloakId = (
      await kcAdminClient.users.create(registerUserToKeycloakUser(userData))
    ).id;
  } catch (e) {
    const response = getResponse(e);
    if (response == null || response.status != 409) {
      throw e;
    }
  }

  if (!keycloakId) {
    keycloakId = (
      await kcAdminClient.users.find({ email: userData.mail, realm: "mercury" })
    )[0].id!;
  }

  const dbUserData: CreateUser = {
    ...removeKeys(userData, ["password"]),
    issuer: "mercury",
    issuer_id: keycloakId,
  };

  await createUser(session, dbUserData);

  const user = await getUser(session, { mail: userData.mail });
  return user!;
}

export async function getUser(
  session: Session,
  props: Partial<User>,
): Promise<User | null> {
  const user = await getDbUser(session, props);
  if (!user) {
    return null;
  }

  return filterUser(user);
}

export async function getDbUser(
  session: Session,
  props: Partial<DbUser>,
): Promise<DbUser | null> {
  const propsStr = Object.keys(props)
    .map((k) => `${k}: $${k}`)
    .join(", ");

  const userExistsResult = await session.run(
    `MATCH (u:User {${propsStr}}) RETURN u`,
    props,
  );

  if (userExistsResult.records.length === 0) {
    return null;
  }

  const user = userExistsResult.records[0].get("u").properties as DbUser;
  return user;
}

export async function getAllUsers(session: Session) {
  const usersRequest = await session.run(`MATCH (u:User) RETURN u`);
  const users = usersRequest.records.map((r) =>
    filterUser(r.get("u").properties),
  );
  return users;
}

export type UserScore = [User, number];

export async function searchUser(
  session: Session,
  searchTerm: string,
  country: string,
  pageIndex: number,
  pageSize: number,
  userId: string = "",
): Promise<UserScore[] | null> {
  const queryElems = neo4j.int((pageIndex + 1) * pageSize);
  const querySkip = neo4j.int(pageIndex * pageSize);
  const queryLimit = neo4j.int(pageSize);

  let userRequest: neo4j.QueryResult;

  if (!searchTerm) {
    userRequest = await session.run(
      `MATCH (u:User)
       WHERE ($country = "" OR u.country = $country) AND u.id <> $userId
       RETURN u as similarUser, 1.0 as score
       SKIP $querySkip
       LIMIT $queryLimit`,
      { queryElems, country, userId, querySkip, queryLimit },
    );
  } else {
    const wordVec = wordToVec(searchTerm);

    if (wordVec.length == 0) {
      return null;
    }

    userRequest = await session.run(
      `CALL db.index.vector.queryNodes('user-names', $queryElems, $wordVec)
       YIELD node AS similarUser, score
       WHERE ($country = "" OR similarUser.country = $country) AND similarUser.id <> $userId
       RETURN similarUser, score
       SKIP $querySkip
       LIMIT $queryLimit`,
      { wordVec, queryElems, userId, country, querySkip, queryLimit },
    );
  }

  const users = userRequest.records.map((r) => {
    return [
      filterUser(r.get("similarUser").properties),
      Number(r.get("score")),
    ] as UserScore;
  });

  return users;
}

export async function getUsersCount(session: Session): Promise<neo4j.Integer> {
  const usersCount = await session.run(`MATCH (u:User) RETURN count(u)`);

  return usersCount.records[0].get(0);
}

export type GenerateNameEmbeddingResult = {
  success: boolean;
  firstNameCorrect: boolean;
  lastNameCorrect: boolean;
  nameEmbedding: number[];
};

export async function generateNameEmbedding(
  firstName: string,
  lastName: string,
): Promise<GenerateNameEmbeddingResult> {
  const firstNameEmbedding = wordToVec(firstName);
  const lastNameEmbedding = wordToVec(lastName);

  const firstNameCorrect = firstNameEmbedding.length > 0;
  const lastNameCorrect = lastNameEmbedding.length > 0;
  const success = firstNameCorrect && lastNameCorrect;

  if (!success) {
    return {
      success,
      firstNameCorrect,
      lastNameCorrect,
      nameEmbedding: [],
    };
  }

  const nameEmbedding = firstNameEmbedding.map((e1, i) => {
    const e2 = lastNameEmbedding[i];
    return (e1 + e2) / 2;
  });

  return {
    success,
    firstNameCorrect,
    lastNameCorrect,
    nameEmbedding,
  };
}

export async function updateUser(
  session: Session,
  userId: string,
  newUserProps: Partial<DbUser>,
): Promise<boolean> {
  const user = await getDbUser(session, { id: userId });
  if (!user) {
    return false;
  }

  if (!("password" in user) && user.issuer == "mercury") {
    const keycloakUser = await kcAdminClient.users.findOne({
      id: user.issuer_id,
    });

    if (keycloakUser) {
      await kcAdminClient.users.update(
        { id: user.issuer_id },
        {
          firstName: newUserProps.first_name,
          lastName: newUserProps.last_name,
        },
      );
    }
  }

  const { nameEmbedding } = await generateNameEmbedding(
    newUserProps.first_name || user.first_name,
    newUserProps.last_name || user.last_name,
  );
  const newUser = { ...user, ...newUserProps, name_embedding: nameEmbedding };
  await session.run(`MATCH (u:User {id: $userId}) SET u=$user`, {
    userId,
    user: newUser,
  });

  return true;
}

export type ChangePasswordSuccess = "success";
export type ChangePasswordError = "verify" | "repeat";
export type ChangePasswordResult = ChangePasswordSuccess | ChangePasswordError;

export async function changePassword(
  session: Session,
  user: DbUser,
  oldPassword: string,
  newPassword: string,
  repeatPassword: string,
): Promise<ChangePasswordResult> {
  if (!("password" in user)) {
    if (user.issuer == "mercury") {
      const keycloakUser = await kcAdminClient.users.findOne({
        id: user.issuer_id,
      });

      const requiredActions = keycloakUser?.requiredActions || [];
      requiredActions.push("UPDATE_PASSWORD");

      await kcAdminClient.users.update(
        { id: user.issuer_id },
        {
          requiredActions,
        },
      );
      return "success";
    } else {
      throw new Error("not implemented");
    }
  }

  const match: boolean = await bcrypt.compare(oldPassword, user.password);
  if (!match) {
    return "verify";
  }

  if (newPassword != repeatPassword) {
    return "repeat";
  }

  const passwordHashed = await bcrypt.hash(newPassword, 10);
  const updatedUser = { ...user, password: passwordHashed };

  await session.run(`MATCH (u:User {id: $userId}) SET u=$user`, {
    userId: user.id,
    user: updatedUser,
  });
  return "success";
}

export async function deleteUser(
  session: Session,
  userId: string,
): Promise<boolean> {
  const user = await getDbUser(session, { id: userId });

  if (!user) {
    return false;
  }

  if (!("password" in user) && user.issuer == "mercury") {
    await kcAdminClient.users.del({ id: user.issuer_id });
  }

  await session.run(`MATCH (u:User {id: $userId}) DETACH DELETE u`, {
    userId,
  });

  return true;
}

export async function getFriends(
  session: Session,
  userId: string,
  pageIndex: number,
  pageSize: number,
): Promise<User[] | null> {
  const user = await getUser(session, { id: userId });
  if (!user) {
    return null;
  }

  const querySkip = neo4j.int(pageIndex * pageSize);
  const queryLimit = neo4j.int(pageSize);

  const friendRequest = await session.run(
    `MATCH (u:User {id: $userId})-[:IS_FRIENDS_WITH]-(f:User)
     RETURN DISTINCT f
     SKIP $querySkip
     LIMIT $queryLimit`,
    { userId, querySkip, queryLimit },
  );

  const friends = friendRequest.records.map((f) =>
    filterUser(f.get("f").properties),
  );
  return friends;
}

export async function getFriendsCount(
  session: Session,
  userId: string,
): Promise<neo4j.Integer | null> {
  const user = await getUser(session, { id: userId });
  if (!user) {
    return null;
  }

  const friendsCountRequest = await session.run(
    `MATCH (u:User {id: $userId})-[:IS_FRIENDS_WITH]-(f:User)
     RETURN count(DISTINCT f)`,
    { userId },
  );

  const friendsCount = friendsCountRequest.records[0].get(0);
  return friendsCount;
}

export async function isFriend(
  session: Session,
  firstUserId: string,
  secondUserId: string,
) {
  try {
    const request = await session.run(
      `
      MATCH (u1:User {id: $firstUserId})
      MATCH (u2:User {id: $secondUserId})
      RETURN exists((u1)-[:IS_FRIENDS_WITH]-(u2))
      `,
      { firstUserId, secondUserId },
    );

    return request.records?.[0].get(0);
  } catch (err) {
    return false;
  }
}

export async function getFriendRequests(
  session: Session,
  userId: string,
  pageIndex: number,
  pageSize: number,
): Promise<User[] | null> {
  const user = await getUser(session, { id: userId });
  if (!user) {
    return null;
  }

  const querySkip = neo4j.int(pageIndex * pageSize);
  const queryLimit = neo4j.int(pageSize);

  const friendRequestsRequest = await session.run(
    `MATCH (u:User {id: $userId})<-[:SENT_INVITE_TO]-(f:User)
     WITH f ORDER BY f.last_name, f.first_name
     RETURN DISTINCT f
     SKIP $querySkip
     LIMIT $queryLimit`,
    { userId, querySkip, queryLimit },
  );

  const friends = friendRequestsRequest.records.map((f) =>
    filterUser(f.get("f").properties),
  );
  return friends;
}

export async function getFriendRequestsCount(
  session: Session,
  userId: string,
): Promise<neo4j.Integer | null> {
  const user = await getUser(session, { id: userId });
  if (!user) {
    return null;
  }

  const friendRequestsCountRequest = await session.run(
    `MATCH (u:User {id: $userId})<-[:SENT_INVITE_TO]-(f:User)
     RETURN count(DISTINCT f)`,
    { userId },
  );

  const friendRequestsCount = friendRequestsCountRequest.records[0].get(0);
  return friendRequestsCount;
}

export async function getFriendSuggestions(
  session: Session,
  userId: string,
  pageIndex: number,
  pageSize: number,
): Promise<User[] | null> {
  const user = await getUser(session, { id: userId });
  if (!user) {
    return null;
  }

  const querySkip = neo4j.int(pageIndex * pageSize);
  const queryLimit = neo4j.int(pageSize);

  const friendSuggestionsRequest = await session.run(
    `MATCH (u:User {id: $userId})-[:IS_FRIENDS_WITH]-(f:User)-[:IS_FRIENDS_WITH]-(s:User)
     WHERE NOT (u)-[:IS_FRIENDS_WITH]-(s) AND s.id <> $userId
     RETURN DISTINCT s
     SKIP $querySkip
     LIMIT $queryLimit`,
    { userId, querySkip, queryLimit },
  );

  const friends = friendSuggestionsRequest.records.map((s) =>
    filterUser(s.get("s").properties),
  );
  return friends;
}

export async function getFriendSuggestionsCount(
  session: Session,
  userId: string,
): Promise<neo4j.Integer | null> {
  const user = await getUser(session, { id: userId });
  if (!user) {
    return null;
  }

  const friendRequestsCountRequest = await session.run(
    `MATCH (u:User {id: $userId})-[:IS_FRIENDS_WITH]-(f:User)-[:IS_FRIENDS_WITH]-(s:User)
     WHERE NOT (u)-[:IS_FRIENDS_WITH]-(s) AND s.id <> $userId
     RETURN count(DISTINCT s)`,
    { userId },
  );

  const friendRequestsCount = friendRequestsCountRequest.records[0].get(0);
  return friendRequestsCount;
}

export type CheckFriendsResult = {
  firstUserExists: boolean;
  secondUserExists: boolean;
  areFriends: boolean;
};

export async function checkFriends(
  session: Session,
  userId1: string,
  userId2: string,
): Promise<CheckFriendsResult> {
  const firstUser = await getUser(session, { id: userId1 });
  const secondUser = await getUser(session, { id: userId2 });

  const firstUserExists = firstUser !== null;
  const secondUserExists = secondUser !== null;

  if (!firstUserExists || !secondUserExists) {
    return { firstUserExists, secondUserExists, areFriends: false };
  }

  const areFriends = await isFriend(session, userId1, userId2);
  return { firstUserExists, secondUserExists, areFriends };
}

export type SendFriendInviteResult = {
  success: boolean;
  firstUserExists: boolean;
  secondUserExists: boolean;
};

export async function sendFriendRequest(
  session: Session,
  userId1: string,
  userId2: string,
): Promise<SendFriendInviteResult> {
  const { firstUserExists, secondUserExists, areFriends } = await checkFriends(
    session,
    userId1,
    userId2,
  );

  if (!firstUserExists || !secondUserExists || areFriends) {
    return { success: false, firstUserExists, secondUserExists };
  }

  await session.run(
    `MATCH (a:User {id: $userId1}), (b:User {id: $userId2})
     MERGE (a)-[:SENT_INVITE_TO]->(b)`,
    { userId1, userId2 },
  );

  return { success: true, firstUserExists, secondUserExists };
}

export type AcceptFriendRequestResult = {
  success: boolean;
  firstUserExists: boolean;
  secondUserExists: boolean;
  sentInvite: boolean;
  alreadyFriends: boolean;
};

export async function acceptFriendRequest(
  session: Session,
  userId1: string,
  userId2: string,
): Promise<AcceptFriendRequestResult> {
  const {
    firstUserExists,
    secondUserExists,
    areFriends: alreadyFriends,
  } = await checkFriends(session, userId1, userId2);

  if (!firstUserExists || !secondUserExists || alreadyFriends) {
    return {
      success: false,
      firstUserExists,
      secondUserExists,
      sentInvite: false,
      alreadyFriends,
    };
  }

  const acceptInviteRequest = await session.run(
    `MATCH (u1:User {id: $userId1})<-[r:SENT_INVITE_TO]-(u2:User {id: $userId2})
     DELETE r
     CREATE (u1)-[:IS_FRIENDS_WITH]->(u2)
     RETURN true`,
    { userId1, userId2 },
  );

  const records = acceptInviteRequest.records;
  const sentInvite = records.length > 0;

  return {
    success: sentInvite,
    firstUserExists,
    secondUserExists,
    sentInvite,
    alreadyFriends,
  };
}

export async function addFriend(
  session: Session,
  userId1: string,
  userId2: string,
) {
  await session.run(
    `MATCH (u1:User {id: $userId1}), (u2:User {id: $userId2})
     CREATE (u1)-[:IS_FRIENDS_WITH]->(u2)
     RETURN true`,
    { userId1, userId2 },
  );
}

export type DeclineFriendRequestResult = {
  success: boolean;
  firstUserExists: boolean;
  secondUserExists: boolean;
  wasFriend: boolean;
  wasInvited: boolean;
};

export async function declineFriendRequest(
  session: Session,
  userId1: string,
  userId2: string,
): Promise<DeclineFriendRequestResult> {
  const {
    firstUserExists,
    secondUserExists,
    areFriends: wasFriend,
  } = await checkFriends(session, userId1, userId2);

  if (!firstUserExists || !secondUserExists || wasFriend) {
    return {
      success: false,
      firstUserExists,
      secondUserExists,
      wasFriend,
      wasInvited: false,
    };
  }

  const acceptInviteRequest = await session.run(
    `MATCH (u1)<-[r:SENT_INVITE_TO]->(u2)
     DELETE r
     RETURN true`,
    { userId1, userId2 },
  );

  const wasInvited = acceptInviteRequest.records.length > 0;

  return {
    success: wasInvited,
    firstUserExists,
    secondUserExists,
    wasFriend,
    wasInvited,
  };
}

export type DeleteFriendResult = {
  success: boolean;
  firstUserExists: boolean;
  secondUserExists: boolean;
  wasFriend: boolean;
};

export async function deleteFriend(
  session: Session,
  userId1: string,
  userId2: string,
): Promise<DeleteFriendResult> {
  const {
    firstUserExists,
    secondUserExists,
    areFriends: wasFriend,
  } = await checkFriends(session, userId1, userId2);

  if (!firstUserExists || !secondUserExists || !wasFriend) {
    return {
      success: false,
      firstUserExists,
      secondUserExists,
      wasFriend: false,
    };
  }

  await session.run(
    `MATCH (u1)-[r:IS_FRIENDS_WITH]->(u2)
     DELETE r
     RETURN true`,
    { userId1, userId2 },
  );

  return {
    success: true,
    firstUserExists,
    secondUserExists,
    wasFriend,
  };
}
