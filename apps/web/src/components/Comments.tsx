import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  Text,
  TextField,
} from "@radix-ui/themes";
import { TrashIcon, PaperPlaneIcon } from "@radix-ui/react-icons";
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
    <Card
      size="3"
      style={{
        backgroundImage:
          "linear-gradient(180deg, var(--accent-a3), var(--accent-a2))",
        borderColor: "var(--accent-a6)",
      }}
    >
      <Heading size="5" mb="4">
        Comments
      </Heading>

      <Box mb="4">
        {isLoading ? (
          <Text color="gray">Loading comments...</Text>
        ) : comments.length === 0 ? (
          <Text color="gray">No comments yet.</Text>
        ) : (
          <Flex direction="column" gap="3">
            {comments.map((c) => (
              <Flex key={c.id} gap="3" align="start">
                <Avatar
                  src={c.avatarUrl}
                  alt={c.username}
                  fallback={c.username[0]?.toUpperCase() ?? "?"}
                  size="2"
                  radius="full"
                />
                <Box flexGrow="1">
                  <Flex align="center" gap="2" mb="1">
                    <Text size="2" weight="bold">
                      {c.username}
                    </Text>
                    <Text size="1" color="gray">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </Text>
                    {user?.user_id === c.userId && (
                      <Box ml="auto">
                        <IconButton
                          variant="ghost"
                          color="red"
                          size="1"
                          onClick={() => remove.mutate(c.id)}
                          aria-label="Delete comment"
                        >
                          <TrashIcon />
                        </IconButton>
                      </Box>
                    )}
                  </Flex>
                  <Text
                    size="2"
                    color="gray"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {c.body}
                  </Text>
                </Box>
              </Flex>
            ))}
          </Flex>
        )}
      </Box>

      {user ? (
        <form onSubmit={handleSubmit}>
          <Flex gap="3" align="center">
            <Avatar
              src={user.avatar_url}
              alt={user.username}
              fallback={user.username[0]?.toUpperCase() ?? "?"}
              size="2"
              radius="full"
            />
            <Box flexGrow="1">
              <TextField.Root
                size="2"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Leave a comment..."
                maxLength={1000}
              />
            </Box>
            <Button
              type="submit"
              variant="solid"
              disabled={!body.trim() || post.isPending}
            >
              <PaperPlaneIcon />
              Post
            </Button>
          </Flex>
        </form>
      ) : (
        <Text color="gray" size="2">
          <a
            href="/api/auth/login"
            style={{ color: "var(--accent-11)", textDecoration: "underline" }}
          >
            Log in with osu!
          </a>{" "}
          to leave a comment.
        </Text>
      )}
    </Card>
  );
}
