"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [roomId, setRoomId] = useState("");

  const router = useRouter();

  return (
    <div className="flex h-screen justify-center items-center">
      <div className="flex-col grid grid-cols-2 "  >
        <input
          className="m-2"
          type="text"
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
          }}
          placeholder="RoomId"
        />
        <button
          className="m-2"
          onClick={() => {
            router.push(`/room/${roomId}`);
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
