import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { eq, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { comment as commentTable, user as userTable } from "../db/schema.js";
import { getSession } from "./auth.js";

const router = new Hono();

router.get("/:scoreId", async (c) => {
  const { scoreId } = c.req.param();
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
    .where(eq(commentTable.scoreId, scoreId))
    .orderBy(asc(commentTable.createdAt));
  return c.json(rows);
});

router.post("/:scoreId", async (c) => {
  const session = await getSession(getCookie(c, "session"));
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const { scoreId } = c.req.param();
  const { body } = await c.req.json<{ body: string }>();

  const trimmed = body?.trim();
  if (!trimmed) return c.json({ error: "Comment body is required" }, 400);
  if (trimmed.length > 1000) return c.json({ error: "Comment too long" }, 400);

  const [comment] = await db
    .insert(commentTable)
    .values({ scoreId, userId: session.user_id, body: trimmed })
    .returning();

  return c.json(
    {
      ...comment,
      username: session.username,
      avatarUrl: session.avatar_url,
    },
    201,
  );
});

router.delete("/:commentId", async (c) => {
  const session = await getSession(getCookie(c, "session"));
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const commentId = Number(c.req.param("commentId"));
  const [comment] = await db
    .select()
    .from(commentTable)
    .where(eq(commentTable.id, commentId));

  if (!comment) return c.json({ error: "Not found" }, 404);
  if (comment.userId !== session.user_id)
    return c.json({ error: "Forbidden" }, 403);

  await db.delete(commentTable).where(eq(commentTable.id, commentId));
  return c.json({ ok: true });
});

export default router;
