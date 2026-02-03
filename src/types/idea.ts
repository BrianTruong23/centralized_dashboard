
export type IdeaStatus = 'backlog' | 'planned' | 'in-progress' | 'done';

export interface Idea {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  created_at: number; // or string
}
