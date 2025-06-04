import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("middleware_definition")
export class Middleware_definition {
  @Column({ type: "boolean", nullable: false, default: false })
  isEnabled: boolean;

  @Column({ type: "text", nullable: false })
  handler: string;

  @Column({ type: "varchar", nullable: true })
  path: string;

  @Column({ type: "varchar", nullable: true })
  method: string;

  @Column({ type: "varchar", nullable: false })
  name: string;

  @PrimaryGeneratedColumn('increment')
  id: number;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}