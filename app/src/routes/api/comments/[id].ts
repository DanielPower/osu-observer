import {
  defineHandler,
  getCookie,
  getMethod,
  getRouterParam,
  readBody,
  setResponseStatus,
} from "h3";
import { eq, asc } from "drizzle-orm";
import { db } from "../../../db/index";
import { comment as commentTable, user as userTable } from "../../../db/schema";
import { getSession } from "../../../lib/auth";

export default defineHandler(async (event) => {
  const method = getMethod(event);
  const id = getRouterParam(event, "id")!;

  try {
    if (method === "GET") {
      const rows = await db
        .select({
          id: commentTable.id,
          scoreId: commentTable.scoreId,
          userId: commentTable.userId,
          body: commentTable.body,
          createdAt: commentTable.createdAt,
          username: userTable.username,
          avatarUrl: userTable.avatarUrl,
        })
        .from(commentTable)
        .innerJoin(userTable, eq(commentTable.userId, userTable.id))
        .where(eq(commentTable.scoreId, id))
        .orderBy(asc(commentTable.createdAt));
      return rows;
    }

    if (method === "POST") {
      const session = await getSession(getCookie(event, "session"));
      if (!session) {
        setResponseStatus(event, 401);
        return { error: "Unauthorized" };
      }

      const bodyData = await readBody<{ body?: string }>(event);
      const trimmed = bodyData?.body?.trim();
      if (!trimmed) {
        setResponseStatus(event, 400);
        return { error: "Comment body is required" };
      }
      if (trimmed.length > 1000) {
        setResponseStatus(event, 400);
        return { error: "Comment too long" };
      }

      const [comment] = await db
        .insert(commentTable)
        .values({ scoreId: id, userId: session.user_id, body: trimmed })
        .returning();

      setResponseStatus(event, 201);
      return {
        ...comment,
        username: session.username,
        avatarUrl: session.avatar_url,
      };
    }

    if (method === "DELETE") {
      const session = await getSession(getCookie(event, "session"));
      if (!session) {
        setResponseStatus(event, 401);
        return { error: "Unauthorized" };
      }

      const commentId = Number(id);
      const [comment] = await db
        .select()
        .from(commentTable)
        .where(eq(commentTable.id, commentId));

      if (!comment) {
        setResponseStatus(event, 404);
        return { error: "Not found" };
      }
      if (comment.userId !== session.user_id) {
        setResponseStatus(event, 403);
        return { error: "Forbidden" };
      }

      await db.delete(commentTable).where(eq(commentTable.id, commentId));
      return { ok: true };
    }

    setResponseStatus(event, 405);
    return { error: "Method Not Allowed" };
  } catch (err) {
    console.error(`[${method} /api/comments/${id}]`, err);
    setResponseStatus(event, 500);
    return { error: "Internal Server Error" };
  }
});
