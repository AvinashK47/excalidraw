import axios from "axios";
import { BACKEND_URL } from "../../config";
import CollaborativeCanvas from "../../components/Canvas";

async function getRoomId(slug: string): Promise<number | null> {
  try {
    const response = await axios.get(`${BACKEND_URL}/room/${slug}`, {
      timeout: 3000,
    });
    return response.data.room?.id || null;
  } catch {
    return null;
  }
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  let roomId = await getRoomId(slug);

  // Fallback room ID derived deterministically from slug if http-backend hasn't created it yet
  if (!roomId) {
    let hash = 0;
    for (let i = 0; i < slug.length; i++) {
      hash = (hash << 5) - hash + slug.charCodeAt(i);
      hash |= 0;
    }
    roomId = Math.abs(hash) || 1;
  }

  return <CollaborativeCanvas roomId={roomId} roomSlug={slug} />;
}
