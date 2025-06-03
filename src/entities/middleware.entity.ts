import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class MiddlewareDefinition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ nullable: false })
  name: string;

  @Column({ nullable: true })
  method: string | null;

  @Column({ nullable: true })
  path: string | null;

  @Column({ nullable: false, type: 'text' })
  handler: string;

  @Column({ default: false })
  isEnabled: boolean;
}
