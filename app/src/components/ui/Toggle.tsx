import { Flex, Switch, Text } from "@radix-ui/themes";

export function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id?: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Flex align="center" justify="between">
      <Text as="label" htmlFor={id} size="2" color="gray">
        {label}
      </Text>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Flex>
  );
}
