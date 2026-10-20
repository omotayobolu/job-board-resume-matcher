import index from "../config/pinecone";

const fetchVector = async (id: string, namespace: "job" | "job_seeker"): Promise<number[] | null> => {
  try {
    const ns = index.namespace(namespace);
    const response = await ns.fetch([id]);

    console.log("Fetch response:", response);

    const record = response.records[id];

    if (record) {
      return record.values ? Array.from(record.values) : null;
    } else {
      console.error("No vector found for ID:", id);
      return null;
    }
  } catch (error) {
    throw new Error(`Failed to fetch ${namespace} vector for ${id}`, {
      cause: error,
    });
  }
};
export { fetchVector };
