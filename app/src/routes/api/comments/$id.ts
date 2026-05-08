import { createFileRoute } from "@tanstack/react-router";
import { eq, asc } from "drizzle-orm";
import { db } from "../../../db/index";
import { comment as commentTable, user as userTable } from "../../../db/schema";
import { getSession } from "../../../lib/auth";

export const Route = createFileRoute("/api/comments/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
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
          .where(eq(commentTable.scoreId, params.id))
          .orderBy(asc(commentTable.createdAt));
        return Response.json(rows);
      },
      POST: async ({ request, params }) => {
        const match = (request.headers.get("cookie") ?? "").match(
          /(?:^|;\s*)session=([^;]*)/,
        );
        const session = await getSession(
          match ? decodeURIComponent(match[1]!) : undefined,
        );
        if (!session)
          return Response.json({ error: "Unauthorized" }, { status: 401 });

        const bodyData = (await request.json()) as { body?: string };
        const trimmed = bodyData?.body?.trim();
        if (!trimmed)
          return Response.json(
            { error: "Comment body is required" },
            { status: 400 },
          );
        if (trimmed.length > 1000)
          return Response.json({ error: "Comment too long" }, { status: 400 });

        const [comment] = await db
          .insert(commentTable)
          .values({
            scoreId: params.id,
            userId: session.user_id,
            body: trimmed,
          })
          .returning();

        return Response.json(
          {
            ...comment,
            username: session.username,
            avatarUrl: session.avatar_url,
          },
          { status: 201 },
        );
      },
      DELETE: async ({ request, params }) => {
        const match = (request.headers.get("cookie") ?? "").match(
          /(?:^|;\s*)session=([^;]*)/,
        );
        const session = await getSession(
          match ? decodeURIComponent(match[1]!) : undefined,
        );
        if (!session)
          return Response.json({ error: "Unauthorized" }, { status: 401 });

        const commentId = Number(params.id);
        const [comment] = await db
          .select()
          .from(commentTable)
          .where(eq(commentTable.id, commentId));

        if (!comment)
          return Response.json({ error: "Not found" }, { status: 404 });
        if (comment.userId !== session.user_id)
          return Response.json({ error: "Forbidden" }, { status: 403 });

        await db.delete(commentTable).where(eq(commentTable.id, commentId));
        return Response.json({ ok: true });
      },
    },
  },
});
