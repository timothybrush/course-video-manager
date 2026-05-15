import { GenerateClipSectionsModal } from "@/features/video-editor/components/generate-clip-sections-modal";
import { createHttpClipService } from "@/services/clip-service";
import { createContext, useCallback, useContext, useState } from "react";
import { useRevalidator } from "react-router";

type OpenInput = { videoId: string; videoLabel: string };

const GenerateClipSectionsContext = createContext<
  ((input: OpenInput) => void) | null
>(null);

export const useGenerateClipSectionsAction = (): ((
  input: OpenInput
) => void) => {
  const ctx = useContext(GenerateClipSectionsContext);
  if (!ctx) {
    throw new Error(
      "useGenerateClipSectionsAction must be used inside GenerateClipSectionsProvider"
    );
  }
  return ctx;
};

export const GenerateClipSectionsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState<OpenInput | null>(null);

  const handleOpen = useCallback((input: OpenInput) => {
    setOpen(input);
  }, []);

  return (
    <GenerateClipSectionsContext.Provider value={handleOpen}>
      {children}
      {open && (
        <GenerateClipSectionsModal
          open={true}
          videoId={open.videoId}
          videoLabel={open.videoLabel}
          onClose={() => setOpen(null)}
          onConfirm={async (sections) => {
            const clipService = createHttpClipService();
            await clipService.regenerateClipSections({
              videoId: open.videoId,
              sections,
            });
            revalidator.revalidate();
            setOpen(null);
          }}
        />
      )}
    </GenerateClipSectionsContext.Provider>
  );
};
