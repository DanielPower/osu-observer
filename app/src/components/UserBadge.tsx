import { Avatar, Badge, Text } from "@radix-ui/themes";

type UserBadgeProps = {
  userId: number | string;
  username: string;
  avatarUrl?: string;
};

export function UserBadge({ userId, username, avatarUrl }: UserBadgeProps) {
  return (
    <Badge
      asChild
      style={{ paddingLeft: "2px", paddingTop: "2px", paddingBottom: "2px" }}
      variant="surface"
      radius="medium"
    >
      <a href={`https://osu.ppy.sh/users/${userId}`}>
        <Avatar
          src={avatarUrl}
          alt={username}
          fallback={username[0]?.toUpperCase() ?? "?"}
          size="1"
          radius="medium"
        />{" "}
        <Text size="2" weight="medium">
          {username}
        </Text>
      </a>
    </Badge>
  );
}
