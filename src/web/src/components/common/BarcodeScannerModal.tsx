import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Modal } from "@components/common/Modal";
import { Button } from "@components/common/Button";

const VideoWrapper = styled.div`
  position: relative;
  width: 100%;
  background: #000;
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
  aspect-ratio: 4/3;
`;

const Video = styled.video`
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
`;

const ScanLine = styled.div`
  position: absolute;
  left: 10%;
  right: 10%;
  height: 2px;
  background: ${({ theme }) => theme.colors.primary};
  box-shadow: 0 0 8px ${({ theme }) => theme.colors.primary};
  animation: scan 2s ease-in-out infinite;

  @keyframes scan {
    0% {
      top: 20%;
    }
    50% {
      top: 80%;
    }
    100% {
      top: 20%;
    }
  }
`;

const ScanFrame = styled.div`
  position: absolute;
  inset: 15%;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-radius: 4px;
  pointer-events: none;
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
  margin: ${({ theme }) => theme.spacing.md} 0;
`;

const Hint = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin: ${({ theme }) => theme.spacing.sm} 0 0;
`;

interface BarcodeScannerModalProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({
  onScan,
  onClose,
}: BarcodeScannerModalProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const useBarcodeDetector = "BarcodeDetector" in window;

    if (useBarcodeDetector) {
      // Chrome, Edge, modern Android
      const detector = new (window as any).BarcodeDetector({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"],
      });

      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
        .then((stream) => {
          streamRef.current = stream;
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          video.play();

          const tick = async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) {
              rafRef.current = requestAnimationFrame(tick);
              return;
            }
            try {
              const results = await detector.detect(videoRef.current);
              if (results.length > 0) {
                onScan(results[0].rawValue);
                return;
              }
            } catch {
              // detection failed this frame — keep trying
            }
            rafRef.current = requestAnimationFrame(tick);
          };

          rafRef.current = requestAnimationFrame(tick);
        })
        .catch(() => {
          setError(
            t("scanner.cameraError") ||
              "Could not access camera. Please allow camera permissions and try again.",
          );
        });

      return () => {
        cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach((track) => track.stop());
      };
    } else {
      // iOS Safari and other browsers without BarcodeDetector — use ZXing
      let stopped = false;
      let controlsStop: (() => void) | null = null;

      import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();

        reader
          .decodeFromVideoDevice(
            undefined,
            videoRef.current!,
            (result, err) => {
              if (result) {
                onScan(result.getText());
              }
              // err is just "no barcode found this frame" — ignore
            },
          )
          .then((controls) => {
            controlsStop = () => controls.stop();
          })
          .catch(() => {
            setError(
              t("scanner.cameraError") ||
                "Could not access camera. Please allow camera permissions and try again.",
            );
          });
      });

      return () => {
        stopped = true;
        controlsStop?.();
      };
    }
  }, []);

  return (
    <Modal title={t("scanner.title") || "Scan Barcode"} onClose={onClose}>
      {error ? (
        <ErrorMsg>{error}</ErrorMsg>
      ) : (
        <>
          <VideoWrapper>
            <Video ref={videoRef} playsInline muted />
            <ScanFrame />
            <ScanLine />
          </VideoWrapper>
          <Hint>{t("scanner.pointCamera") || "Point camera at a barcode"}</Hint>
        </>
      )}
      <Button
        type="button"
        variant="secondary"
        onClick={onClose}
        style={{ marginTop: 12, width: "100%" }}
      >
        {t("common.cancel")}
      </Button>
    </Modal>
  );
}
