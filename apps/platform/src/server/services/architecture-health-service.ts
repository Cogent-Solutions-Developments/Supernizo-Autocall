import 'server-only';

export type ArchitectureHealthInput = Readonly<{
  probe: 'architecture';
}>;

export type ArchitectureHealthResult = Readonly<{
  generatedAt: string;
  probe: 'architecture';
  status: 'ok';
}>;

export interface ArchitectureHealthService {
  getHealth(input: ArchitectureHealthInput): ArchitectureHealthResult;
}

export const architectureHealthService: ArchitectureHealthService = {
  getHealth(input) {
    return {
      generatedAt: new Date().toISOString(),
      probe: input.probe,
      status: 'ok',
    };
  },
};
