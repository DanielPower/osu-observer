import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface User {
  user_id: number;
  username: string;
  avatar_url: string;
}

async function fetchMe(): Promise<User | null> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return null;
  return res.json();
}

export function useAuth() {
  return useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetch("/api/auth/logout", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => queryClient.setQueryData(["auth", "me"], null),
  });
}
