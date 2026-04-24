import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL || "/api";

interface Comment {
  id: number;
  scoreId: string;
  userId: number;
  username: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
}

async function fetchComments(scoreId: string): Promise<Comment[]> {
  const res = await fetch(`${API_URL}/comments/${scoreId}`);
  if (!res.ok) throw new Error("Failed to load comments");
  return res.json();
}

export function Comments({ scoreId }: { scoreId: string }) {
  const { data: user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", scoreId],
    queryFn: () => fetchComments(scoreId),
  });

  const post = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`${API_URL}/comments/${scoreId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", scoreId] });
      setBody("");
    },
  });

  const remove = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await fetch(`${API_URL}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete comment");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", scoreId] });
    },
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (body.trim()) post.mutate(body);
  };

  return (
    <div className="rounded-xl bg-slate-800 p-6 shadow-xl">
      <h2 className="mb-6 text-2xl font-bold text-white">Comments</h2>

      {isLoading ? (
        <p className="text-slate-400">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-slate-400">No comments yet.</p>
      ) : (
        <ul className="mb-6 space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <img
                src={c.avatarUrl}
                alt={c.username}
                className="h-9 w-9 shrink-0 rounded-full"
              />
              <div className="flex-1">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="font-semibold text-white">{c.username}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                  {user?.user_id === c.userId && (
                    <button
                      onClick={() => remove.mutate(c.id)}
                      className="ml-auto text-xs text-slate-500 hover:text-red-400"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="text-slate-300">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {user ? (
        <form onSubmit={handleSubmit} className="flex gap-3">
          <img
            src={user.avatar_url}
            alt={user.username}
            className="h-9 w-9 shrink-0 rounded-full"
          />
          <div className="flex flex-1 gap-2">
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Leave a comment..."
              maxLength={1000}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white placeholder-slate-400 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!body.trim() || post.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              Post
            </button>
          </div>
        </form>
      ) : (
        <p className="text-slate-400">
          <a href="/api/auth/login" className="text-blue-400 hover:underline">
            Log in with osu!
          </a>{" "}
          to leave a comment.
        </p>
      )}
    </div>
  );
}
