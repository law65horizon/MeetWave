import { useRef, useCallback, Ref } from "react";
import * as mediasoupClient from "mediasoup-client";
import type { Socket } from "socket.io-client";
import { useMeetingStore } from "../store/meetingStore";
import type { ProducerInfo } from "../types";

export function useMediasoup(socketRef: React.MutableRefObject<Socket | null>) {
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const sendTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const recvTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const producersRef = useRef<Map<string, mediasoupClient.types.Producer>>(
    new Map(),
  );
  const consumersRef = useRef<Map<string, mediasoupClient.types.Consumer>>(
    new Map(),
  );
  const rtpCapabilitiesRef =
    useRef<mediasoupClient.types.RtpCapabilities | null>(null);

  const { setRemoteStream } = useMeetingStore();

  const loadDevice = useCallback(
    async (rtpCapabilities: mediasoupClient.types.RtpCapabilities) => {
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;
      rtpCapabilitiesRef.current = device.recvRtpCapabilities;
      return device;
    },
    [],
  );

  const createSendTransport = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || !deviceRef.current) return null;
    return new Promise<mediasoupClient.types.Transport>((resolve, reject) => {
      socket.emit(
        "transport:create",
        { direction: "send" },
        (res: { error?: string; params?: Record<string, unknown> }) => {
          if (res.error || !res.params) return reject(new Error(res.error));
          const transport = deviceRef.current!.createSendTransport(
            res.params as mediasoupClient.types.TransportOptions,
          );
          transport.on("connect", ({ dtlsParameters }, cb, errCb) => {
            socket.emit(
              "transport:connect",
              { transportId: transport.id, dtlsParameters },
              (r: { error?: string }) => {
                r.error ? errCb(new Error(r.error)) : cb();
              },
            );
          });
          transport.on(
            "produce",
            ({ kind, rtpParameters, appData }, cb, errCb) => {
              socket.emit(
                "produce",
                { transportId: transport.id, kind, rtpParameters, appData },
                (r: { error?: string; producerId?: string }) => {
                  r.error
                    ? errCb(new Error(r.error))
                    : cb({ id: r.producerId! });
                },
              );
            },
          );
          sendTransportRef.current = transport;
          resolve(transport);
        },
      );
    });
  }, [socketRef]);

  const createRecvTransport = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || !deviceRef.current) return null;
    return new Promise<mediasoupClient.types.Transport>((resolve, reject) => {
      socket.emit(
        "transport:create",
        { direction: "recv" },
        (res: { error?: string; params?: Record<string, unknown> }) => {
          if (res.error || !res.params) return reject(new Error(res.error));
          const transport = deviceRef.current!.createRecvTransport(
            res.params as mediasoupClient.types.TransportOptions,
          );
          transport.on("connect", ({ dtlsParameters }, cb, errCb) => {
            socket.emit(
              "transport:connect",
              { transportId: transport.id, dtlsParameters },
              (r: { error?: string }) => {
                r.error ? errCb(new Error(r.error)) : cb();
              },
            );
          });
          recvTransportRef.current = transport;
          resolve(transport);
        },
      );
    });
  }, [socketRef]);

  const consumeProducer = useCallback(
    async (
      producerInfo: ProducerInfo,
      participantMeta?: { role?: string; isHost?: boolean },
    ) => {
      const socket = socketRef.current;
      if (!socket || !recvTransportRef.current || !rtpCapabilitiesRef.current)
        return;

      return new Promise<void>((resolve) => {
        socket.emit(
          "consume",
          {
            producerId: producerInfo.producerId,
            rtpCapabilities: rtpCapabilitiesRef.current,
          },
          async (res: { error?: string; params?: Record<string, unknown> }) => {
            if (res.error || !res.params) {
              console.error("consumeProducer failed", res.error);
              return resolve();
            }

            try {
              const consumer = await recvTransportRef.current!.consume(
                res.params as mediasoupClient.types.ConsumerOptions,
              );
              consumersRef.current.set(consumer.id, consumer);

              const isScreen = producerInfo.isScreenShare;
              const field = isScreen
                ? "screenStream"
                : producerInfo.kind === "video"
                  ? "videoStream"
                  : "audioStream";

              // Set stream immediately so video element attaches early
              const stream = new MediaStream([consumer.track]);
              setRemoteStream(producerInfo.socketId, {
                socketId: producerInfo.socketId,
                userId: producerInfo.userId,
                displayName: producerInfo.displayName,
                role: (participantMeta?.role as any) ?? undefined,
                isHost: participantMeta?.isHost ?? undefined,
                [field]: stream,
              });

              // Resume consumer (fire-and-forget, don't block stream attachment)
              socket.emit(
                "consumer:resume",
                { consumerId: consumer.id },
                (r: { error?: string }) => {
                  if (r?.error)
                    console.error("consumer:resume failed", r.error);
                },
              );

              // Re-attach stream on unmute (track may start muted before resume)
              consumer.track.onunmute = () => {
                setRemoteStream(producerInfo.socketId, {
                  [field]: new MediaStream([consumer.track]),
                });
              };

              consumer.on("trackended", () => {
                consumersRef.current.delete(consumer.id);
                setRemoteStream(producerInfo.socketId, { [field]: null });
              });

              consumer.observer.on("close", () => {
                consumersRef.current.delete(consumer.id);
              });

              resolve();
            } catch (e) {
              console.error("consumeProducer error", e);
              resolve();
            }
          },
        );
      });
    },
    [socketRef, setRemoteStream],
  );

  const produceTrack = useCallback(
    async (track: MediaStreamTrack, appData?: Record<string, unknown>) => {
      if (!sendTransportRef.current) return null;
      const producer = await sendTransportRef.current.produce({
        track,
        appData,
      });
      producersRef.current.set(producer.id, producer);
      return producer;
    },
    [],
  );

  const closeAll = useCallback(() => {
    producersRef.current.forEach((p) => {
      try {
        p.close();
      } catch {}
    });
    consumersRef.current.forEach((c) => {
      try {
        c.close();
      } catch {}
    });
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    producersRef.current.clear();
    consumersRef.current.clear();
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    rtpCapabilitiesRef.current = null;
  }, []);

  return {
    deviceRef,
    sendTransportRef,
    recvTransportRef,
    producersRef,
    consumersRef,
    rtpCapabilitiesRef,
    loadDevice,
    createSendTransport,
    createRecvTransport,
    consumeProducer,
    produceTrack,
    closeAll,
  };
}
