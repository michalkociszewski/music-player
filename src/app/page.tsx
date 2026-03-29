import { RadioPlayer } from "@/components/RadioPlayer";
import { Queue } from "@/components/Queue";
import { QueueProcessor } from "@/components/QueueProcessor";

export default function Home() {
  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center gap-6 bg-black py-12">
      <QueueProcessor />
      <RadioPlayer />
      <Queue />
    </div>
  );
}
