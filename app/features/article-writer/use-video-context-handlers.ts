import { useCallback } from "react";
import type { FetcherWithComponents } from "react-router";
import type { WritePageAction } from "./write-page-reducer";

export function useVideoContextHandlers({
  videoId,
  transcript,
  openFolderFetcher,
  deleteLinkFetcher,
  dispatch,
}: {
  videoId: string;
  transcript: string;
  openFolderFetcher: FetcherWithComponents<unknown>;
  deleteLinkFetcher: FetcherWithComponents<unknown>;
  dispatch: React.Dispatch<WritePageAction>;
}) {
  const handleCopyTranscript = useCallback(
    () => navigator.clipboard.writeText(transcript),
    [transcript]
  );

  const handleIncludeCourseStructureChange = useCallback(
    (checked: boolean) => {
      dispatch({ type: "set-include-course-structure", value: checked });
    },
    [dispatch]
  );

  const handleFileClick = useCallback(
    (filePath: string) => {
      dispatch({ type: "open-preview-modal", filePath });
    },
    [dispatch]
  );

  const handleOpenFolderClick = useCallback(() => {
    openFolderFetcher.submit(null, {
      method: "post",
      action: `/api/videos/${videoId}/open-folder`,
    });
  }, [videoId, openFolderFetcher]);

  const handleAddFromClipboardClick = useCallback(
    () => dispatch({ type: "set-paste-modal-open", value: true }),
    [dispatch]
  );

  const handleDeleteFile = useCallback(
    (path: string) => {
      dispatch({ type: "open-delete-modal", path });
    },
    [dispatch]
  );

  const handleDeleteLink = useCallback(
    (linkId: string) => {
      deleteLinkFetcher.submit(null, {
        method: "post",
        action: `/api/links/${linkId}/delete`,
      });
    },
    [deleteLinkFetcher]
  );

  const handleAddLinkClick = useCallback(
    () => dispatch({ type: "set-add-link-modal-open", value: true }),
    [dispatch]
  );

  const handleMemoryEnabledChange = useCallback(
    (enabled: boolean) => {
      dispatch({ type: "set-memory-enabled", value: enabled });
    },
    [dispatch]
  );

  const handleEditFile = useCallback(
    async (path: string) => {
      try {
        const response = await fetch(
          `/api/video-files/read?videoId=${videoId}&path=${encodeURIComponent(path)}`
        );
        if (response.ok) {
          const content = await response.text();
          dispatch({ type: "open-file-modal", path, content });
        }
      } catch (error) {
        console.error("Failed to read file:", error);
      }
    },
    [videoId, dispatch]
  );

  return {
    handleCopyTranscript,
    handleIncludeCourseStructureChange,
    handleFileClick,
    handleOpenFolderClick,
    handleAddFromClipboardClick,
    handleDeleteFile,
    handleDeleteLink,
    handleAddLinkClick,
    handleMemoryEnabledChange,
    handleEditFile,
  };
}
