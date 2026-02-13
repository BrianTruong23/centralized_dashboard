export interface Project {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type CreateProjectInput = Omit<Project, 'id' | 'user_id' | 'created_at'>;
