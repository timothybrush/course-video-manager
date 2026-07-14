import { Data, Effect, Config } from "effect";

export class BufferApiError extends Data.TaggedError("BufferApiError")<{
  message: string;
}> {}

export type BufferPostStatus = "draft" | "buffer" | "sent" | "error";

const BUFFER_API_URL = "https://api.buffer.com";

const graphql = (opts: {
  token: string;
  query: string;
  variables?: Record<string, unknown>;
}) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(BUFFER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.token}`,
        },
        body: JSON.stringify({
          query: opts.query,
          variables: opts.variables,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Buffer API ${res.status}: ${text}`);
      }

      const json = await res.json();
      if (json.errors?.length) {
        throw new Error(
          `Buffer GraphQL: ${json.errors.map((e: { message: string }) => e.message).join(", ")}`
        );
      }

      return json.data;
    },
    catch: (e) =>
      new BufferApiError({
        message: e instanceof Error ? e.message : String(e),
      }),
  });

const createBufferApiOperations = (token: string) => ({
  createPost: (opts: { channelId: string; text: string; videoUrl: string }) =>
    graphql({
      token,
      query: `
        mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) {
            id
          }
        }
      `,
      variables: {
        input: {
          channelIds: [opts.channelId],
          text: opts.text,
          assets: [{ video: { url: opts.videoUrl } }],
          schedulingType: "automatic",
        },
      },
    }).pipe(Effect.map((data) => ({ id: data.createPost.id as string }))),

  getPostStatus: (postId: string) =>
    graphql({
      token,
      query: `
        query GetPostStatus($id: ID!) {
          post(id: $id) {
            status
          }
        }
      `,
      variables: { id: postId },
    }).pipe(
      Effect.map((data) => ({
        status: data.post.status as BufferPostStatus,
      }))
    ),
});

export class BufferApiService extends Effect.Service<BufferApiService>()(
  "BufferApiService",
  {
    effect: Effect.gen(function* () {
      const token = yield* Config.string("BUFFER_API_TOKEN");
      return createBufferApiOperations(token);
    }),
    dependencies: [],
  }
) {}
