import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  AlertDialog,
  Avatar,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  Link as RadixLink,
  Text,
  TextArea,
} from "@radix-ui/themes";
import { TrashIcon, ClockIcon } from "@radix-ui/react-icons";
import { useAuth } from "../hooks/useAuth";
import { formatTimestamp } from "../lib/score-summary";

interface Comment {
  id: number;
  scoreId: string;
  userId: number;
  username: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
}

// Matches mm:ss, optionally with osu! modding-style milliseconds (mm:ss:SSS).
const TIMESTAMP_PATTERN = /\b(\d{1,3}):([0-5]\d)(?::(\d{3}))?\b/g;

async function fetchComments(scoreId: string): Promise<Comment[]> {
  const res = await fetch(`/api/comments/${scoreId}`);
  if (!res.ok) throw new Error("Failed to load comments");
  return res.json();
}

function CommentBody({ body, onSeek }: { body: string; onSeek: (seconds: number) => void }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(TIMESTAMP_PATTERN)) {
    const index = match.index;
    if (index > lastIndex) parts.push(body.slice(lastIndex, index));
    const seconds =
      Number(match[1]) * 60 + Number(match[2]) + (match[3] ? Number(match[3]) / 1000 : 0);
    parts.push(
      <button
        key={index}
        type="button"
        onClick={() => onSeek(seconds)}
        aria-label={`Jump to ${match[0]}`}
        className="tabular"
        style={{
          display: "inline-block",
          padding: "0 6px",
          margin: "0 1px",
          border: 0,
          borderRadius: "var(--radius-2)",
          backgroundColor: "var(--accent-a4)",
          color: "var(--accent-11)",
          font: "inherit",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {match[0]}
      </button>,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}

export function Comments({
  scoreId,
  onSeek,
  currentTime,
}: {
  scoreId: string;
  onSeek: (seconds: number) => void;
  currentTime: () => number;
}) {
  const { data: user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", scoreId],
    queryFn: () => fetchComments(scoreId),
  });

  const post = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`/api/comments/${scoreId}`, {
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
      const res = await fetch(`/api/comments/${commentId}`, {
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

  const insertCurrentTime = () => {
    const stamp = formatTimestamp(currentTime());
    const textArea = textAreaRef.current;
    const at = textArea?.selectionStart ?? body.length;
    const before = body.slice(0, at);
    const after = body.slice(at);
    const spacer = before && !before.endsWith(" ") ? " " : "";
    setBody(`${before}${spacer}${stamp} ${after}`);
    textArea?.focus();
  };

  return (
    <Card size="3" className="tinted-card">
      <Heading as="h2" size="5" mb="4">
        Comments{" "}
        {comments.length > 0 && (
          <Text color="gray" weight="regular">
            {comments.length}
          </Text>
        )}
      </Heading>

      {user ? (
        <form onSubmit={handleSubmit}>
          <Flex gap="3" align="start" mb="5">
            <Avatar
              src={user.avatar_url}
              alt=""
              fallback={user.username[0]?.toUpperCase() ?? "?"}
              size="2"
              radius="full"
            />
            <Flex direction="column" gap="2" flexGrow="1">
              <label htmlFor="comment-body" className="visually-hidden">
                Comment
              </label>
              <TextArea
                id="comment-body"
                ref={textAreaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Say something. Times like 01:23 become links to that moment."
                maxLength={1000}
                rows={2}
                resize="vertical"
              />
              <Flex justify="between" align="center" gap="2" wrap="wrap">
                <Button
                  type="button"
                  variant="ghost"
                  color="gray"
                  size="1"
                  onClick={insertCurrentTime}
                >
                  <ClockIcon />
                  Insert current time
                </Button>
                <Button type="submit" radius="full" disabled={!body.trim() || post.isPending}>
                  Post
                </Button>
              </Flex>
            </Flex>
          </Flex>
        </form>
      ) : (
        <Text as="p" color="gray" size="2" mb="4">
          <RadixLink href="/api/auth/login" underline="always">
            Log in with osu!
          </RadixLink>{" "}
          to leave a comment.
        </Text>
      )}

      {isLoading ? (
        <Text color="gray" size="2">
          Loading comments...
        </Text>
      ) : comments.length === 0 ? (
        <Text color="gray" size="2">
          No comments yet. Be the first to point out a great moment.
        </Text>
      ) : (
        <Flex direction="column" gap="4">
          {comments.map((c) => (
            <Flex key={c.id} gap="3" align="start">
              <Avatar
                src={c.avatarUrl}
                alt=""
                fallback={c.username[0]?.toUpperCase() ?? "?"}
                size="2"
                radius="full"
              />
              <Box flexGrow="1" minWidth="0">
                <Flex align="center" gap="2" mb="1">
                  <Text size="2" weight="bold">
                    {c.username}
                  </Text>
                  <Text size="1" color="gray">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </Text>
                  {user?.user_id === c.userId && (
                    <Box ml="auto">
                      <AlertDialog.Root>
                        <AlertDialog.Trigger>
                          <IconButton
                            variant="ghost"
                            color="gray"
                            size="1"
                            aria-label="Delete comment"
                          >
                            <TrashIcon />
                          </IconButton>
                        </AlertDialog.Trigger>
                        <AlertDialog.Content maxWidth="400px">
                          <AlertDialog.Title>Delete this comment?</AlertDialog.Title>
                          <AlertDialog.Description size="2">
                            This can&apos;t be undone.
                          </AlertDialog.Description>
                          <Flex gap="3" mt="4" justify="end">
                            <AlertDialog.Cancel>
                              <Button variant="soft" color="gray">
                                Cancel
                              </Button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action>
                              <Button color="red" onClick={() => remove.mutate(c.id)}>
                                Delete
                              </Button>
                            </AlertDialog.Action>
                          </Flex>
                        </AlertDialog.Content>
                      </AlertDialog.Root>
                    </Box>
                  )}
                </Flex>
                <Text as="p" size="2" style={{ whiteSpace: "pre-wrap", color: "var(--gray-12)" }}>
                  <CommentBody body={c.body} onSeek={onSeek} />
                </Text>
              </Box>
            </Flex>
          ))}
        </Flex>
      )}
    </Card>
  );
}
