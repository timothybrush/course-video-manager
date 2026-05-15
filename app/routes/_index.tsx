"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { CreateSectionModal } from "@/components/create-section-modal";
import { VideoModal } from "@/components/video-player";
import { useFocusRevalidate } from "@/hooks/use-focus-revalidate";
import {
  courseViewReducer,
  createInitialCourseViewState,
} from "@/features/course-view/course-view-reducer";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import { Button } from "@/components/ui/button";
import { DBFunctionsService } from "@/services/db-service.server";
import {
  loadExportStatusMap,
  loadLessonFsMaps,
  toSlimVideo,
} from "@/services/course-loader-fs";
import type { ExportClip } from "@/services/export-hash";
import { FeatureFlagService } from "@/services/feature-flag-service";
import { runtimeLive } from "@/services/layer.server";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Console, Effect } from "effect";
import { getGitStatusAsync } from "@/services/git-status-service.server";
import { Plus } from "lucide-react";
import { Suspense, useCallback, useContext, useMemo, useState } from "react";
import {
  data,
  useFetcher,
  useNavigate,
  useSearchParams,
  useSubmit,
} from "react-router";
import { useEffectReducer } from "use-effect-reducer";
import type { Route } from "./+types/_index";
import { UploadContext } from "@/features/upload-manager/upload-context";
import { ActionsDropdown } from "@/features/course-view/actions-menu";
import { GenerateClipSectionsProvider } from "@/features/course-view/generate-clip-sections-context";
import { SectionGrid } from "@/features/course-view/section-grid";
import {
  FilterBar,
  StatsBar,
  NoCourseView,
  ReadOnlyBanner,
  RouteModals,
} from "@/features/course-view/course-view-components";
import { NextTodoCard } from "@/features/course-view/next-todo-card";
import {
  createLessonDragHandler,
  createSectionDragHandler,
  computeFsStatusCounts,
  computeFlatLessons,
  computeDependencyMap,
} from "@/features/course-view/course-editor-helpers";
import {
  courseEditorFetcherKeyForEvent,
  deleteVideoFetcherKey,
} from "@/features/course-view/optimistic-applier";
import {
  useOptimisticCourse,
  useCourseEditorFailureToast,
} from "@/features/course-view/use-optimistic-course";

export const meta: Route.MetaFunction = ({ data }) => {
  const selectedCourse = data?.selectedCourse;

  if (selectedCourse) {
    return [
      {
        title: `CVM - ${selectedCourse.name}`,
      },
    ];
  }

  return [
    {
      title: "CVM",
    },
  ];
};

export const loader = async (args: Route.LoaderArgs) => {
  const url = new URL(args.request.url);
  const selectedCourseId = url.searchParams.get("courseId");
  const selectedVersionId = url.searchParams.get("versionId");

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const featureFlags = yield* FeatureFlagService;

    const [
      courses,
      standaloneVideos,
      sidebarPitches,
      sidebarDiagrams,
      courseWarningCounts,
    ] = yield* Effect.all(
      [
        db.getCourses(),
        db.getStandaloneVideosSidebar(),
        db.listPitches(),
        db.listDiagrams(),
        db.getCourseWarningCounts(),
      ],
      { concurrency: "unbounded" }
    );

    const coursesWithWarnings = courses.map((c) => ({
      ...c,
      warningCount: courseWarningCounts[c.id] ?? 0,
    }));

    let versions: Awaited<
      ReturnType<typeof db.getCourseVersions>
    > extends Effect.Effect<infer R, any, any>
      ? R
      : never = [];
    let selectedVersion: Awaited<
      ReturnType<typeof db.getLatestCourseVersion>
    > extends Effect.Effect<infer R, any, any>
      ? R
      : never = undefined;

    if (selectedCourseId) {
      versions = yield* db.getCourseVersions(selectedCourseId);

      // If versionId provided, use it; otherwise use latest
      if (selectedVersionId) {
        selectedVersion = yield* db
          .getCourseVersionById(selectedVersionId)
          .pipe(
            Effect.catchTag("NotFoundError", () => Effect.succeed(undefined))
          );
      } else {
        selectedVersion = yield* db.getLatestCourseVersion(selectedCourseId);
      }
    }

    const selectedCourse = yield* !selectedCourseId
      ? Effect.succeed(undefined)
      : db
          .getCourseWithSlimClipsById(selectedCourseId, selectedVersion?.id)
          .pipe(
            Effect.andThen((course) => {
              if (!course) {
                return undefined;
              }

              const allSections = course.versions[0]?.sections ?? [];

              return {
                ...course,
                sections: allSections.filter((section) => {
                  return !section.path.endsWith("ARCHIVE");
                }),
              };
            })
          );

    // Build slim video summaries for the UI (no clip arrays sent to client)
    const allVideos = selectedCourse?.sections.flatMap((s) =>
      s.lessons.flatMap((l) => l.videos)
    );

    const slimCourse = selectedCourse
      ? (() => {
          const { versions, sections, ...courseRest } = selectedCourse;
          return {
            ...courseRest,
            sections: sections.map((section) => {
              const { lessons, ...sectionRest } = section;
              return {
                ...sectionRest,
                lessons: lessons.map((lesson) => {
                  const { videos, ...lessonRest } = lesson;
                  return {
                    ...lessonRest,
                    videos: videos.map(toSlimVideo),
                  };
                }),
              };
            }),
          };
        })()
      : undefined;

    const lessons = selectedCourse?.filePath
      ? selectedCourse.sections.flatMap((section) =>
          section.lessons
            .filter((lesson) => lesson.fsStatus !== "ghost")
            .map((lesson) => ({
              id: lesson.id,
              fullPath: `${selectedCourse.filePath}/${section.path}/${lesson.path}`,
            }))
        )
      : [];

    // Deferred: streams to the client after initial render
    const hasExportedVideoMap = selectedCourse
      ? runtimeLive.runPromise(
          loadExportStatusMap({
            courseId: selectedCourse.id,
            videos: (allVideos ?? []).map((v) => ({
              id: v.id,
              clips: v.clips as ExportClip[],
            })),
          })
        )
      : Promise.resolve({} as Record<string, boolean>);

    const lessonFsMaps = runtimeLive.runPromise(loadLessonFsMaps({ lessons }));

    // Deferred: transcript text per video, loaded via separate DB query
    const videoTranscripts = selectedCourseId
      ? runtimeLive.runPromise(db.getVideoTranscripts(selectedCourseId))
      : Promise.resolve({} as Record<string, string>);

    const latestVersion = versions[0];
    const isLatestVersion = !!(
      selectedVersion &&
      latestVersion &&
      selectedVersion.id === latestVersion.id
    );

    const gitStatus = selectedCourse?.filePath
      ? getGitStatusAsync(selectedCourse.filePath)
      : Promise.resolve(null);

    return {
      courses: coursesWithWarnings,
      standaloneVideos,
      sidebarPitches: sidebarPitches.slice(0, 5).map((p) => ({
        id: p.id,
        title: p.title,
      })),
      sidebarDiagrams: sidebarDiagrams.slice(0, 5).map((d) => ({
        id: d.id,
        name: d.name,
      })),
      selectedCourse: slimCourse,
      versions,
      selectedVersion,
      isLatestVersion,
      hasExportedVideoMap,
      lessonFsMaps,
      videoTranscripts,
      gitStatus,
      showMediaFilesList: featureFlags.isEnabled("ENABLE_MEDIA_FILES_LIST"),
    };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Not Found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

export default function Component(props: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const selectedCourseId = searchParams.get("courseId");

  // Key on courseId so React remounts the inner component (and resets
  // reducer state) whenever the user switches courses — same pattern
  // the video editor uses with key={video.id}.
  return <ComponentInner {...props} key={selectedCourseId ?? "no-course"} />;
}

function ComponentInner(props: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedCourseId = searchParams.get("courseId");
  const loaderData = props.loaderData;
  const courses = loaderData.courses;

  // UI state reducer — no entity state, just modals/selections/filters
  const [viewState, dispatch] = useEffectReducer(
    courseViewReducer,
    createInitialCourseViewState(),
    {}
  );

  // Entity mutations use useSubmit with per-action fetcherKey so
  // useFetchers() can surface concurrent in-flight events for optimistic UI.
  const submit = useSubmit();

  const submitEvent = useCallback(
    (event: CourseEditorEvent) => {
      submit(event, {
        method: "post",
        encType: "application/json",
        action: "/api/course-editor",
        navigate: false,
        fetcherKey: courseEditorFetcherKeyForEvent(event),
      });
    },
    [submit]
  );

  const optimisticData = useOptimisticCourse(loaderData);
  useCourseEditorFailureToast();

  const currentCourse = optimisticData.selectedCourse;
  const displaySections = currentCourse?.sections ?? [];

  const {
    isAddCourseModalOpen,
    isCreateSectionModalOpen,
    isAddStandaloneVideoModalOpen,
    addGhostLessonSectionId,
    insertAdjacentLessonId,
    insertPosition,
    addVideoToLessonId,
    editSectionId,
    convertToGhostLessonId,
    deleteLessonId,
    createOnDiskLessonId,
    archiveSectionId,
    videoPlayerState,
    priorityFilter,
    iconFilter,
    fsStatusFilter,
    searchQuery,
  } = viewState;

  const [nextUpDismissed, setNextUpDismissed] = useState(false);
  const { startExportUpload, startBatchExportUpload } =
    useContext(UploadContext);

  useFocusRevalidate({ enabled: !!selectedCourseId, intervalMs: 5000 });

  const submitDeleteVideo = useCallback(
    (videoId: string) => {
      submit(
        { videoId },
        {
          method: "post",
          action: "/api/videos/delete",
          navigate: false,
          fetcherKey: deleteVideoFetcherKey(videoId),
        }
      );
    },
    [submit]
  );

  // Fetchers still needed for video operations and non-entity mutations
  const deleteVideoFileFetcher = useFetcher();
  const revealVideoFetcher = useFetcher();
  const archiveCourseFetcher = useFetcher();
  const gitPushFetcher = useFetcher();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleLessonDragEnd = useMemo(
    () => createLessonDragHandler(submitEvent),
    [submitEvent]
  );

  const handleSectionDragEnd = useMemo(
    () => createSectionDragHandler(submitEvent),
    [submitEvent]
  );

  const allFlatLessons = useMemo(
    () => computeFlatLessons(displaySections),
    [displaySections]
  );

  const dependencyMap = useMemo(
    () => computeDependencyMap(displaySections),
    [displaySections]
  );

  const fsStatusCounts = useMemo(
    () =>
      computeFsStatusCounts(displaySections, {
        priorityFilter,
        iconFilter,
        searchQuery,
      }),
    [displaySections, priorityFilter, iconFilter, searchQuery]
  );

  const handleBatchExport = () => {
    if (!loaderData.selectedVersion) return;
    startBatchExportUpload(loaderData.selectedVersion.id);
  };

  return (
    <GenerateClipSectionsProvider>
      <div className="flex h-screen bg-background text-foreground">
        <AppSidebar
          courses={courses}
          standaloneVideos={loaderData.standaloneVideos}
          pitches={loaderData.sidebarPitches}
          diagrams={loaderData.sidebarDiagrams}
          selectedCourseId={selectedCourseId}
          isAddCourseModalOpen={isAddCourseModalOpen}
          setIsAddCourseModalOpen={(open) =>
            dispatch({ type: "set-add-course-modal-open", open })
          }
          isAddStandaloneVideoModalOpen={isAddStandaloneVideoModalOpen}
          setIsAddStandaloneVideoModalOpen={(open) =>
            dispatch({ type: "set-add-standalone-video-modal-open", open })
          }
        />

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {currentCourse ? (
              <>
                {/* Title + version + actions */}
                <div className="flex items-center gap-2 mb-2">
                  <h1 className="text-2xl font-bold flex items-center gap-2">
                    {currentCourse.name}
                    {loaderData.selectedVersion &&
                      loaderData.versions.length > 1 && (
                        <button
                          onClick={() =>
                            dispatch({
                              type: "set-version-selector-modal-open",
                              open: true,
                            })
                          }
                          className="text-muted-foreground hover:text-foreground transition-colors text-lg font-normal"
                        >
                          [{loaderData.selectedVersion.name || "Draft"}]
                        </button>
                      )}
                  </h1>
                  <ActionsDropdown
                    currentCourse={currentCourse}
                    data={loaderData}
                    dispatch={dispatch}
                    archiveCourseFetcher={archiveCourseFetcher}
                    gitPushFetcher={gitPushFetcher}
                    handleBatchExport={handleBatchExport}
                  />
                </div>

                {loaderData.selectedVersion && !loaderData.isLatestVersion && (
                  <ReadOnlyBanner />
                )}

                <div className="mb-10">
                  <StatsBar
                    selectedCourse={currentCourse}
                    gitStatus={loaderData.gitStatus}
                  />
                </div>

                <Suspense>
                  {loaderData.isLatestVersion && (
                    <div className="mb-14">
                      <NextTodoCard
                        sections={displaySections}
                        data={loaderData}
                        navigate={navigate}
                        addVideoToLessonId={addVideoToLessonId}
                        convertToGhostLessonId={convertToGhostLessonId}
                        deleteLessonId={deleteLessonId}
                        createOnDiskLessonId={createOnDiskLessonId}
                        dispatch={dispatch}
                        submitEvent={submitEvent}
                        startExportUpload={startExportUpload}
                        revealVideoFetcher={revealVideoFetcher}
                        deleteVideoFileFetcher={deleteVideoFileFetcher}
                        submitDeleteVideo={submitDeleteVideo}
                        allFlatLessons={allFlatLessons}
                        dependencyMap={dependencyMap}
                        dismissed={nextUpDismissed}
                        onDismiss={() => setNextUpDismissed(true)}
                      />
                    </div>
                  )}

                  <div className="mb-4">
                    <h2 className="text-lg font-semibold mb-3">All Lessons</h2>
                    <FilterBar
                      priorityFilter={priorityFilter}
                      iconFilter={iconFilter}
                      fsStatusFilter={fsStatusFilter}
                      fsStatusCounts={fsStatusCounts}
                      searchQuery={searchQuery}
                      dispatch={dispatch}
                      isRealCourse={currentCourse?.filePath != null}
                    />
                  </div>

                  <SectionGrid
                    currentCourse={currentCourse}
                    data={loaderData}
                    isGhostCourse={!currentCourse?.filePath}
                    sensors={sensors}
                    handleSectionDragEnd={handleSectionDragEnd}
                    handleLessonDragEnd={handleLessonDragEnd}
                    priorityFilter={priorityFilter}
                    iconFilter={iconFilter}
                    fsStatusFilter={fsStatusFilter}
                    searchQuery={searchQuery}
                    addGhostLessonSectionId={addGhostLessonSectionId}
                    insertAdjacentLessonId={insertAdjacentLessonId}
                    insertPosition={insertPosition}
                    editSectionId={editSectionId}
                    addVideoToLessonId={addVideoToLessonId}
                    convertToGhostLessonId={convertToGhostLessonId}
                    deleteLessonId={deleteLessonId}
                    createOnDiskLessonId={createOnDiskLessonId}
                    archiveSectionId={archiveSectionId}
                    dispatch={dispatch}
                    submitEvent={submitEvent}
                    navigate={navigate}
                    startExportUpload={startExportUpload}
                    revealVideoFetcher={revealVideoFetcher}
                    deleteVideoFileFetcher={deleteVideoFileFetcher}
                    submitDeleteVideo={submitDeleteVideo}
                  />

                  {loaderData.selectedVersion && loaderData.isLatestVersion && (
                    <div className="mt-8 flex justify-center">
                      <Button
                        variant="outline"
                        className="border-dashed"
                        onClick={() =>
                          dispatch({
                            type: "set-create-section-modal-open",
                            open: true,
                          })
                        }
                      >
                        <Plus className="w-4 h-4" />
                        Add Section
                      </Button>
                    </div>
                  )}
                </Suspense>

                {loaderData.selectedVersion && loaderData.isLatestVersion && (
                  <CreateSectionModal
                    repoVersionId={loaderData.selectedVersion.id}
                    maxOrder={displaySections.length}
                    open={isCreateSectionModalOpen}
                    onOpenChange={(open) =>
                      dispatch({ type: "set-create-section-modal-open", open })
                    }
                    onCreateSection={(title) => {
                      const maxOrder = displaySections.reduce(
                        (max, s) => Math.max(max, s.order ?? 0),
                        0
                      );
                      submitEvent({
                        type: "create-section",
                        repoVersionId: loaderData.selectedVersion!.id,
                        title,
                        maxOrder,
                      });
                    }}
                  />
                )}
              </>
            ) : (
              <NoCourseView
                courses={courses}
                standaloneVideos={loaderData.standaloneVideos}
                dispatch={dispatch}
              />
            )}
          </div>
        </div>

        <VideoModal
          videoId={videoPlayerState.videoId}
          videoPath={videoPlayerState.videoPath}
          isOpen={videoPlayerState.isOpen}
          onClose={() => {
            dispatch({ type: "close-video-player" });
          }}
        />

        <RouteModals
          currentCourse={currentCourse}
          data={loaderData}
          selectedCourseId={selectedCourseId}
          viewState={viewState}
          dispatch={dispatch}
          navigate={navigate}
        />
      </div>
    </GenerateClipSectionsProvider>
  );
}
