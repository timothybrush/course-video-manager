import type { DrizzleDB } from "@/services/drizzle-service.server";
import {
  clips,
  clipSections,
  courses,
  courseVersions,
  sections,
  videos,
} from "@/db/schema";
import { UnknownDBServiceError } from "@/services/db-service-errors";
import { desc, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { computeVideoWarnings } from "./video-warnings";

const makeDbCall = <T>(fn: () => Promise<T>) =>
  Effect.tryPromise({
    try: fn,
    catch: (e) => new UnknownDBServiceError({ cause: e }),
  });

export const createCourseWarningOperations = (db: DrizzleDB) => {
  const getCourseWarningCounts = Effect.fn("getCourseWarningCounts")(
    function* () {
      const result = yield* makeDbCall(() =>
        db.query.courses.findMany({
          where: eq(courses.archived, false),
          columns: { id: true },
          with: {
            versions: {
              columns: { id: true },
              orderBy: desc(courseVersions.createdAt),
              limit: 1,
              with: {
                sections: {
                  columns: { id: true },
                  where: isNull(sections.archivedAt),
                  with: {
                    lessons: {
                      columns: { id: true },
                      with: {
                        videos: {
                          columns: { id: true },
                          where: eq(videos.archived, false),
                          with: {
                            clips: {
                              columns: { order: true, archived: true },
                              where: eq(clips.archived, false),
                            },
                            clipSections: {
                              columns: { order: true, archived: true },
                              where: eq(clipSections.archived, false),
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      );

      const counts: Record<string, number> = {};
      for (const course of result) {
        let count = 0;
        const version = course.versions[0];
        if (version) {
          for (const section of version.sections) {
            for (const lesson of section.lessons) {
              for (const video of lesson.videos) {
                count += computeVideoWarnings({
                  clips: video.clips,
                  clipSections: video.clipSections,
                }).length;
              }
            }
          }
        }
        counts[course.id] = count;
      }
      return counts;
    }
  );

  return { getCourseWarningCounts };
};
