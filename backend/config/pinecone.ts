import { Pinecone } from "@pinecone-database/pinecone";
import { requiredEnv } from "../env";

const pc = new Pinecone({
  apiKey: requiredEnv("PINECONE_API_KEY"),
});

const index = pc.index("job-matching");

export default index;
