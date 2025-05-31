import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class RouteDefenition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ default: 'GET' })
  method: string;

  @Column({ nullable: false })
  path: string;

  @Column({ type: 'text' })
  handler: string;
}
