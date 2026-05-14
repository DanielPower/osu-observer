import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { Container, Heading, Separator } from "@radix-ui/themes";

const files = import.meta.glob("../changelog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const entries = Object.entries(files)
  .map(([path, content]) => ({
    date: path.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1] ?? "",
    content,
  }))
  .filter((e) => e.date)
  .sort((a, b) => b.date.localeCompare(a.date));

function RouteComponent() {
  return (
    <Container size="2" py="6">
      <Heading size="6" mb="3">
        Changelog
      </Heading>
      {entries.map((entry, i) => (
        <div key={entry.date}>
          {i > 0 && <Separator size="4" my="6" />}
          <Heading size="3" color="gray" mb="3">
            {entry.date}
          </Heading>
          <div className="prose">
            <ReactMarkdown>{entry.content}</ReactMarkdown>
          </div>
        </div>
      ))}
    </Container>
  );
}

export const Route = createFileRoute("/changelog")({
  component: RouteComponent,
});
