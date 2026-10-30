import { Flex, Switch, Text } from "@radix-ui/themes";

export function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id?: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Flex align="start" justify="between" gap="3">
      <Flex direction="column" gap="1">
        <Text as="label" htmlFor={id} size="2">
          {label}
        </Text>
        {description && (
          <Text size="1" color="gray">
            {description}
          </Text>
        )}
      </Flex>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Flex>
  );
}
