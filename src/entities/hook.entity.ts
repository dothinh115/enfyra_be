import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class HookDefinition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ default: 'GET' })
  method: string;

  @Column({ nullable: false })
  path: string;

  @Column({ type: 'text' })
  handler: string;

  @Column({ default: 'beforeHandler' })
  type: string;
}
