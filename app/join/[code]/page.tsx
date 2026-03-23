import { JoinGroupClient } from "@/components/groups/join-group-client";

type JoinPageProps = {
  params: Promise<{ code: string }>;
};

export default async function JoinGroupPage({ params }: JoinPageProps) {
  const resolvedParams = await params;
  return <JoinGroupClient code={resolvedParams.code} />;
}
