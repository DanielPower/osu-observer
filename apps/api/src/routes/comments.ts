import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { eq, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { comments, users } from "../db/schema.js";
import { getSession } from "./auth.js";

const router = new Hono();

router.get("/:scoreId", async (c) => {
  const { scoreId } = c.req.param();
  const rows = await db
    .select({
      id: comments.id,
      scoreId: comments.scoreId,
      userId: comments.userId,
      body: comments.body,
      createdAt: comments.createdAt,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.scoreId, scoreId))
    .orderBy(asc(comments.createdAt));
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
    .insert(comments)
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
    .from(comments)
    .where(eq(comments.id, commentId));

  if (!comment) return c.json({ error: "Not found" }, 404);
  if (comment.userId !== session.user_id)
    return c.json({ error: "Forbidden" }, 403);

  await db.delete(comments).where(eq(comments.id, commentId));
  return c.json({ ok: true });
});

export default router;
