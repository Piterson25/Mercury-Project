import { Request, Response, Router } from "express";
import { Session } from "neo4j-driver";

import driver from "../driver.js";
import { formatError } from "../misc/formatError.js";
import { authenticateToken, JWTRequest } from "../misc/jwt.js";
import { Errors } from "../models/Response.js";
import Page, { pageSchema } from "../models/routes/Page.js";
import User from "../models/User.js";
import {
  AuthOkErrorResponse,
  FriendRequestsPageErrorResponse,
  FriendsPageErrorResponse,
  FriendSuggestionsPageErrorResponse,
  OkErrorResponse,
} from "../types/userResponse.js";
import {
  acceptFriendRequest,
  declineFriendRequest,
  deleteFriend,
  getFriendRequests,
  getFriendRequestsCount,
  getFriends,
  getFriendsCount,
  getFriendSuggestions,
  getFriendSuggestionsCount,
  sendFriendRequest,
} from "../userFriends.js";
import { getDbUser, getTokenDbUser } from "../users.js";
import { userNotFoundRes } from "./usersRoute.js";

const friendsRouter = Router();

friendsRouter.get(
  "/:userId/friends",
  authenticateToken,
  async (req: JWTRequest, res: FriendsPageErrorResponse) => {
    const session = driver.session();
    try {
      const userId = req.params.userId;
      const user = await getTokenDbUser(session, req.token!);

      if (!user) {
        return userNotFoundRes(res);
      }

      if (user.id != userId) {
        return res.status(403).json({ status: "forbidden" });
      }

      const pageParse = pageSchema.safeParse(req.query);
      if (!pageParse.success) {
        const errors = formatError(pageParse.error);
        return res.status(400).json({ status: "error", errors });
      }

      const { page, maxUsers }: Page = pageParse.data;
      const maxUsersBig = BigInt(maxUsers);

      const friends = await getFriends(session, userId, page - 1, maxUsers);
      if (friends === null) {
        return userNotFoundRes(res);
      }

      const friendsCount = await getFriendsCount(session, userId);
      if (friendsCount === null) {
        return userNotFoundRes(res);
      }

      const pageCount = Number(
        (friendsCount.toBigInt() + maxUsersBig - 1n) / maxUsersBig,
      );
      return res.json({ status: "ok", pageCount, friends });
    } catch (err) {
      console.log("Error:", err);
      return res.status(404).json({ status: "error", errors: err as Errors });
    } finally {
      await session.close();
    }
  },
);

friendsRouter.get(
  "/:userId/friend-requests",
  async (req: Request, res: FriendRequestsPageErrorResponse) => {
    const userId = req.params.userId;

    const pageParse = pageSchema.safeParse(req.query);
    if (!pageParse.success) {
      const errors = formatError(pageParse.error);
      return res.status(400).json({ status: "error", errors });
    }

    const { page, maxUsers }: Page = pageParse.data;
    const maxUsersBig = BigInt(maxUsers);

    const session = driver.session();
    try {
      const friendRequests = await getFriendRequests(
        session,
        userId,
        page - 1,
        maxUsers,
      );
      if (friendRequests === null) {
        return userNotFoundRes(res);
      }

      const friendRequestsCount = await getFriendRequestsCount(session, userId);
      if (friendRequestsCount === null) {
        return userNotFoundRes(res);
      }

      const pageCount = Number(
        (friendRequestsCount.toBigInt() + maxUsersBig - 1n) / maxUsersBig,
      );
      return res.json({ status: "ok", pageCount, friendRequests });
    } catch (err) {
      console.log("Error:", err);
      return res.status(404).json({ status: "error", errors: err as Errors });
    } finally {
      await session.close();
    }
  },
);

friendsRouter.get(
  "/:userId/friend-suggestions",
  authenticateToken,
  async (req: JWTRequest, res: FriendSuggestionsPageErrorResponse) => {
    const userId = req.params.userId;

    const session = driver.session();
    try {
      const user = await getTokenDbUser(session, req.token!);

      if (!user) {
        return userNotFoundRes(res);
      }

      if (user.id != userId) {
        return res.status(403).json({ status: "forbidden" });
      }

      const pageParse = pageSchema.safeParse(req.query);
      if (!pageParse.success) {
        const errors = formatError(pageParse.error);
        return res.status(400).json({ status: "error", errors });
      }

      const { page, maxUsers }: Page = pageParse.data;
      const maxUsersBig = BigInt(maxUsers);

      const friendSuggestions = await getFriendSuggestions(
        session,
        userId,
        page - 1,
        maxUsers,
      );
      if (friendSuggestions === null) {
        return userNotFoundRes(res);
      }

      const friendSuggestionsCount = await getFriendSuggestionsCount(
        session,
        userId,
      );
      if (friendSuggestionsCount === null) {
        return userNotFoundRes(res);
      }

      const pageCount = Number(
        (friendSuggestionsCount.toBigInt() + maxUsersBig - 1n) / maxUsersBig,
      );
      return res.json({ status: "ok", pageCount, friendSuggestions });
    } catch (err) {
      console.log("Error:", err);
      return res.status(404).json({ status: "error", errors: err as Errors });
    } finally {
      await session.close();
    }
  },
);

friendsRouter.post(
  "/:userId1/send-friend-request/:userId2",
  authenticateToken,
  async (req: JWTRequest, res: AuthOkErrorResponse) => {
    const session = driver.session();
    const userId1 = req.params.userId1;
    const userId2 = req.params.userId2;

    try {
      const user = await getTokenDbUser(session, req.token!);

      if (!user) {
        return userNotFoundRes(res);
      }

      if (user.id != userId1) {
        return res.status(403).json({ status: "forbidden" });
      }

      const requestResult = await sendFriendRequest(session, userId1, userId2);
      if (!requestResult.success) {
        const { firstUserExists, secondUserExists } = requestResult;
        const errors: Errors = {};

        if (!firstUserExists) {
          errors["userId1"] = "not found";
        }

        if (!secondUserExists) {
          errors["userId2"] = "not found";
        }

        return res.status(400).json({ status: "error", errors });
      }

      return res.json({ status: "ok" });
    } catch (err) {
      console.log("Error:", err);
      return res.status(404).json({ status: "error", errors: err as Errors });
    } finally {
      session.close();
    }
  },
);

friendsRouter.post(
  "/:userId1/accept-friend-request/:userId2",
  authenticateToken,
  async (req: JWTRequest, res: AuthOkErrorResponse) => {
    const session = driver.session();
    const userId1 = req.params.userId1;
    const userId2 = req.params.userId2;

    try {
      const user = await getTokenDbUser(session, req.token!);

      if (!user) {
        return userNotFoundRes(res);
      }

      if (user.id != userId1) {
        return res.status(403).json({ status: "forbidden" });
      }

      const requestResult = await acceptFriendRequest(
        session,
        userId1,
        userId2,
      );
      if (!requestResult.success) {
        const {
          firstUserExists,
          secondUserExists,
          sentInvite,
          alreadyFriends,
        } = requestResult;
        const errors: Errors = {};

        if (!firstUserExists) {
          errors["userId1"] = "not found";
        }

        if (!secondUserExists) {
          errors["userId2"] = "not found";
        }

        if (firstUserExists && secondUserExists && !sentInvite) {
          errors["userId1"] = "not invited";
        }

        if (alreadyFriends) {
          errors["userId1"] = "already friends";
        }

        return res.status(400).json({ status: "error", errors });
      }

      return res.json({ status: "ok" });
    } catch (err) {
      console.log("Error:", err);
      return res.status(404).json({ status: "error", errors: err as Errors });
    } finally {
      session.close();
    }
  },
);

friendsRouter.post(
  "/:userId1/decline-friend-request/:userId2",
  authenticateToken,
  async (req: JWTRequest, res: AuthOkErrorResponse) => {
    const session = driver.session();
    const userId1 = req.params.userId1;
    const userId2 = req.params.userId2;

    try {
      const user = await getTokenDbUser(session, req.token!);

      if (!user) {
        return userNotFoundRes(res);
      }

      if (user.id != userId1) {
        return res.status(403).json({ status: "forbidden" });
      }

      const requestResult = await declineFriendRequest(
        session,
        userId1,
        userId2,
      );
      if (!requestResult.success) {
        const { firstUserExists, secondUserExists, wasFriend, wasInvited } =
          requestResult;
        const errors: Errors = {};

        if (!firstUserExists) {
          errors["userId1"] = "not found";
        }

        if (!secondUserExists) {
          errors["userId2"] = "not found";
        }

        if (firstUserExists && secondUserExists) {
          if (wasFriend) {
            errors["userId1"] = "already friends";
          }
          if (!wasInvited) {
            errors["userId1"] = "not invited";
          }
        }
        return res.status(400).json({ status: "error", errors });
      }

      return res.json({ status: "ok" });
    } catch (err) {
      console.log("Error:", err);
      return res.status(404).json({ status: "error", errors: err as Errors });
    } finally {
      session.close();
    }
  },
);

friendsRouter.delete(
  "/:userId1/delete-friend/:userId2",
  authenticateToken,
  async (req: JWTRequest, res: AuthOkErrorResponse) => {
    const session = driver.session();
    const userId1 = req.params.userId1;
    const userId2 = req.params.userId2;

    try {
      const user = await getTokenDbUser(session, req.token!);

      if (!user) {
        return userNotFoundRes(res);
      }

      if (user.id != userId1) {
        return res.status(403).json({ status: "forbidden" });
      }

      const requestResult = await deleteFriend(session, userId1, userId2);
      if (!requestResult.success) {
        const { firstUserExists, secondUserExists, wasFriend } = requestResult;
        const errors: Errors = {};

        if (!firstUserExists) {
          errors["userId1"] = "not found";
        }

        if (!secondUserExists) {
          errors["userId2"] = "not found";
        }

        if (firstUserExists && secondUserExists && !wasFriend) {
          errors["userId2"] = "not a friend";
        }

        return res.status(400).json({ status: "error", errors });
      }

      return res.json({ status: "ok" });
    } catch (err) {
      console.log("Error:", err);
      return res.status(404).json({ status: "error", errors: err as Errors });
    } finally {
      session.close();
    }
  },
);

export default friendsRouter;
